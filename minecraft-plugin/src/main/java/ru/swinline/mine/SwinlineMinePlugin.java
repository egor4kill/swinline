package ru.swinline.mine;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.PluginCommand;
import org.bukkit.command.TabCompleter;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Мост между Minecraft-сервером и сайтом SWINLINE.
 *
 * 1. Шахта: занос алмазной руды (/sw deposit) в валюту АР и вывод.
 * 2. Апгрейдер: занос любых предметов из руки (/up deposit) в инвентарь Апгрейдера
 *    на сайте и вывод выигранных наград (/up withdraw).
 * 3. World Discovery: автоматическое обнаружение предметов, когда игроки берут/подбирают их.
 */
public final class SwinlineMinePlugin extends JavaPlugin implements Listener, CommandExecutor, TabCompleter {

    private static final String PREFIX = "§8[§bШахта§8] §r";
    private static final String UP_PREFIX = "§8[§6Апгрейдер§8] §r";
    private static final String UNIT = "АР";
    private static final String KEY_PLACEHOLDER = "PASTE_SERVICE_ROLE_KEY_HERE";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final Gson gson = new Gson();

    private final Set<UUID> linked = ConcurrentHashMap.newKeySet();
    private final Set<UUID> syncInFlight = ConcurrentHashMap.newKeySet();
    private final Set<String> depositInFlight = ConcurrentHashMap.newKeySet();
    private final Set<String> discoveredCache = ConcurrentHashMap.newKeySet();
    private final Map<UUID, Long> lastLinkAttempt = new ConcurrentHashMap<>();
    private final Map<String, PendingDeposit> pendingDeposits = new ConcurrentHashMap<>();
    private final Map<UUID, Refund> refunds = new ConcurrentHashMap<>();
    private final Object fileLock = new Object();

    private String siteUrl = "";
    private String serviceKey = "";
    private Material oreMaterial = Material.DIAMOND_ORE;
    private int pollSeconds = 15;
    private boolean autoDeliver = true;
    private boolean debug = false;

    private File pendingFile;
    private int pollTaskId = -1;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        pendingFile = new File(getDataFolder(), "pending.yml");
        loadConfigValues();
        loadPending();

        getServer().getPluginManager().registerEvents(this, this);

        PluginCommand command = getCommand("sw");
        if (command != null) {
            command.setExecutor(this);
            command.setTabCompleter(this);
        }

        PluginCommand upCommand = getCommand("up");
        if (upCommand != null) {
            upCommand.setExecutor(this);
            upCommand.setTabCompleter(this);
        }

        if (!isConfigured()) {
            getLogger().warning("service-key не заполнен. Вставь ключ в plugins/SwinlineMine/config.yml и перезапусти сервер.");
        } else {
            preloadDiscoveredItems();
        }

        pollTaskId = getServer().getScheduler().runTaskTimerAsynchronously(
                this, this::poll, 20L * 5, 20L * Math.max(5, pollSeconds)).getTaskId();

        for (Player player : Bukkit.getOnlinePlayers()) {
            scanPlayerInventory(player);
            syncPlayer(player, false, autoDeliver);
        }

        getLogger().info("SwinlineMine 1.2.0 включён. Сайт: " + (siteUrl.isEmpty() ? "не настроен" : siteUrl));
    }

    @Override
    public void onDisable() {
        if (pollTaskId != -1) {
            getServer().getScheduler().cancelTask(pollTaskId);
            pollTaskId = -1;
        }
        savePending();
    }

    // ------------------------------------------------------------------
    // Конфигурация и файл незавершённых операций
    // ------------------------------------------------------------------

    private void loadConfigValues() {
        siteUrl = trimTrailingSlash(getConfig().getString("supabase-url", ""));
        serviceKey = Objects.toString(getConfig().getString("service-key", ""), "").trim();

        String materialName = Objects.toString(getConfig().getString("ore-material", "DIAMOND_ORE"), "DIAMOND_ORE");
        Material material = Material.matchMaterial(materialName);
        if (material == null || !material.isItem() || !material.isBlock()) {
            getLogger().warning("ore-material=" + materialName + " не подходит, использую DIAMOND_ORE");
            material = Material.DIAMOND_ORE;
        }
        oreMaterial = material;

        pollSeconds = Math.max(5, getConfig().getInt("poll-seconds", 15));
        autoDeliver = getConfig().getBoolean("auto-deliver", true);
        debug = getConfig().getBoolean("debug", false);
    }

    private boolean isConfigured() {
        return !siteUrl.isEmpty()
                && !serviceKey.isEmpty()
                && !serviceKey.contains(KEY_PLACEHOLDER);
    }

    private static String trimTrailingSlash(String value) {
        String result = Objects.toString(value, "").trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private void loadPending() {
        if (pendingFile == null || !pendingFile.exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(pendingFile);

        ConfigurationSection deposits = yaml.getConfigurationSection("deposits");
        if (deposits != null) {
            for (String nonce : deposits.getKeys(false)) {
                ConfigurationSection section = deposits.getConfigurationSection(nonce);
                if (section == null) {
                    continue;
                }
                try {
                    UUID playerId = UUID.fromString(Objects.requireNonNull(section.getString("uuid")));
                    String playerName = Objects.toString(section.getString("name"), "?");
                    int amount = section.getInt("amount");
                    long created = section.getLong("created");
                    if (amount > 0) {
                        pendingDeposits.put(nonce, new PendingDeposit(playerId, playerName, amount, nonce, created));
                    }
                } catch (RuntimeException ex) {
                    getLogger().warning("Битая запись deposits." + nonce + " в pending.yml: " + ex.getMessage());
                }
            }
        }

        ConfigurationSection refundSection = yaml.getConfigurationSection("refunds");
        if (refundSection != null) {
            for (String key : refundSection.getKeys(false)) {
                ConfigurationSection section = refundSection.getConfigurationSection(key);
                if (section == null) {
                    continue;
                }
                try {
                    UUID playerId = UUID.fromString(key);
                    int amount = section.getInt("amount");
                    if (amount > 0) {
                        refunds.put(playerId, new Refund(playerId,
                                Objects.toString(section.getString("name"), "?"), amount));
                    }
                } catch (RuntimeException ex) {
                    getLogger().warning("Битая запись refunds." + key + " в pending.yml: " + ex.getMessage());
                }
            }
        }
    }

    private void savePending() {
        if (pendingFile == null) {
            return;
        }
        synchronized (fileLock) {
            YamlConfiguration yaml = new YamlConfiguration();
            for (PendingDeposit deposit : pendingDeposits.values()) {
                String base = "deposits." + deposit.nonce;
                yaml.set(base + ".uuid", deposit.playerId.toString());
                yaml.set(base + ".name", deposit.playerName);
                yaml.set(base + ".amount", deposit.amount);
                yaml.set(base + ".created", deposit.createdAt);
            }
            for (Refund refund : refunds.values()) {
                String base = "refunds." + refund.playerId;
                yaml.set(base + ".name", refund.playerName);
                yaml.set(base + ".amount", refund.amount);
            }
            try {
                yaml.save(pendingFile);
            } catch (IOException ex) {
                getLogger().warning("Не смог сохранить pending.yml: " + ex.getMessage());
            }
        }
    }

    // ------------------------------------------------------------------
    // События (включая автоматическое World Discovery)
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player) {
            checkAndDiscover(player, event.getItem().getItemStack());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        if (event.getWhoClicked() instanceof Player player) {
            checkAndDiscover(player, event.getCurrentItem());
            checkAndDiscover(player, event.getCursor());
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        scanPlayerInventory(player);

        Refund refund = refunds.remove(player.getUniqueId());
        if (refund != null) {
            savePending();
            runTask(() -> {
                giveOre(player, refund.amount, "возврат за неудачный занос");
                ok(player, "Сайт тогда не принял занос — вернул " + refund.amount + " руды.");
            });
        }
        syncPlayer(player, false, autoDeliver);
        if (autoDeliver) {
            deliverUpgraderWithdrawals(player);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID playerId = event.getPlayer().getUniqueId();
        linked.remove(playerId);
        lastLinkAttempt.remove(playerId);
    }

    // ------------------------------------------------------------------
    // World Discovery логика
    // ------------------------------------------------------------------

    private void preloadDiscoveredItems() {
        if (!isConfigured()) return;
        async(() -> {
            try {
                JsonElement res = rpcElement("get_server_discovered_items", new JsonObject());
                if (res.isJsonArray()) {
                    for (JsonElement item : res.getAsJsonArray()) {
                        discoveredCache.add(item.getAsString().toLowerCase(Locale.ROOT));
                    }
                    getLogger().info("[World Discovery] Загружено " + discoveredCache.size() + " открытых предметов из базы.");
                }
            } catch (Exception ex) {
                getLogger().warning("[World Discovery] Не удалось предзагрузить открытые предметы: " + ex.getMessage());
            }
        });
    }

    private void scanPlayerInventory(Player player) {
        if (player == null || !player.isOnline()) return;
        for (ItemStack stack : player.getInventory().getContents()) {
            checkAndDiscover(player, stack);
        }
    }

    private void checkAndDiscover(Player player, ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return;
        String id = item.getType().name().toLowerCase(Locale.ROOT);
        if (discoveredCache.add(id)) {
            async(() -> {
                try {
                    JsonObject params = new JsonObject();
                    params.addProperty("p_id", id);
                    params.addProperty("p_player", player != null ? player.getName() : "Сервер");
                    rpcElement("server_discover_item", params);
                    getLogger().info("[World Discovery] " + (player != null ? player.getName() : "Сервер") + " открыл новый предмет: " + id);
                } catch (Exception ex) {
                    discoveredCache.remove(id);
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Команды
    // ------------------------------------------------------------------

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String cmd = command.getName().toLowerCase(Locale.ROOT);
        if (cmd.equals("up") || cmd.equals("upgrader") || cmd.equals("upgrade") || label.equalsIgnoreCase("up")) {
            return onUpgraderCommand(sender, args);
        }

        if (args.length == 0) {
            help(sender);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "help", "?" -> help(sender);
            case "ping" -> ping(sender);
            case "up", "upgrader" -> onUpgraderCommand(sender, dropFirst(args));
            case "link", "привязать" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Привязать аккаунт может только игрок.");
                    return true;
                }
                if (args.length < 2) {
                    err(sender, "Использование: /sw link КОД");
                    return true;
                }
                if (!requireConfigured(sender)) {
                    return true;
                }
                link(player, args[1]);
            }
            case "deposit", "dep", "занести" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Заносить руду может только игрок.");
                    return true;
                }
                if (!requireConfigured(sender)) {
                    return true;
                }
                deposit(player, args.length > 1 ? args[1] : null);
            }
            case "balance", "bal", "баланс" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Баланс АР доступен только игроку.");
                    return true;
                }
                if (!requireConfigured(sender)) {
                    return true;
                }
                msg(player, "Смотрю АР на сайте...");
                syncPlayer(player, true, false);
            }
            case "withdraw", "wd", "вывод" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Вывод АР доступен только игроку.");
                    return true;
                }
                if (!requireConfigured(sender)) {
                    return true;
                }
                msg(player, "Проверяю готовые выводы...");
                syncPlayer(player, true, true);
            }
            default -> err(sender, "Не знаю такую команду. /sw help или /up help");
        }
        return true;
    }

    private void help(CommandSender sender) {
        sender.sendMessage(PREFIX + "§eШахта SWINLINE");
        sender.sendMessage("§e/sw link <код> §7— привязать аккаунт сайта (код в профиле или разделе «Шахта»)");
        sender.sendMessage("§e/sw deposit <кол-во|all> §7— занести руду на сайт (1 руда = 1 АР)");
        sender.sendMessage("§e/sw balance §7— сколько АР на сайте и есть ли готовые выводы");
        sender.sendMessage("§e/sw withdraw §7— забрать готовые выводы (АР → руда в инвентарь)");
        sender.sendMessage("§e/sw ping §7— проверить связь с сайтом");
        sender.sendMessage("§6/up §7— команды Апгрейдера предметов (отправка любых предметов на сайт)");
    }

    // ------------------------------------------------------------------
    // Команды Апгрейдера предметов (/up)
    // ------------------------------------------------------------------

    private boolean onUpgraderCommand(CommandSender sender, String[] args) {
        if (args.length == 0) {
            upgraderHelp(sender);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "help", "?" -> upgraderHelp(sender);
            case "ping" -> ping(sender);
            case "link", "привязать" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Привязать аккаунт может только игрок.");
                    return true;
                }
                if (args.length < 2) {
                    sender.sendMessage(UP_PREFIX + "§cИспользование: /up link КОД");
                    return true;
                }
                if (!requireConfigured(sender)) return true;
                link(player, args[1]);
            }
            case "deposit", "dep", "занести", "положить" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Заносить предметы может только игрок.");
                    return true;
                }
                upgraderDeposit(player, args.length > 1 ? args[1] : null);
            }
            case "withdraw", "wd", "вывод", "забрать", "claim" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Вывод предметов доступен только игроку.");
                    return true;
                }
                upgraderWithdraw(player);
            }
            case "balance", "bal", "inv", "list", "инвентарь" -> {
                if (!(sender instanceof Player player)) {
                    err(sender, "Инвентарь доступен только игроку.");
                    return true;
                }
                upgraderBalance(player);
            }
            case "sync", "scan", "открыть" -> {
                for (Player p : Bukkit.getOnlinePlayers()) {
                    scanPlayerInventory(p);
                }
                sender.sendMessage(UP_PREFIX + "§aИнвентари игроков просканированы. Открыто уникальных предметов: §e" + discoveredCache.size());
            }
            default -> sender.sendMessage(UP_PREFIX + "§cНеизвестная подкоманда. Используйте §e/up help");
        }
        return true;
    }

    private void upgraderHelp(CommandSender sender) {
        sender.sendMessage("§8[§6Апгрейдер SWINLINE§8] §eКоманды:");
        sender.sendMessage("§e/up deposit [кол-во|all] §7— отправить предмет из руки на сайт в Апгрейдер");
        sender.sendMessage("§e/up withdraw §7— забрать выведенные с сайта предметы в инвентарь");
        sender.sendMessage("§e/up balance §7(или /up inv) — посмотреть предметы в инвентаре на сайте");
        sender.sendMessage("§e/up link <код> §7— привязать аккаунт сайта (код на сайте в разделе Профиль или Шахта)");
        sender.sendMessage("§e/up sync §7— обновить список открытых сервером предметов прямо сейчас");
    }

    private void upgraderDeposit(Player player, String rawAmount) {
        if (!requireConfigured(player)) {
            return;
        }
        ItemStack held = player.getInventory().getItemInMainHand();
        if (held == null || held.getType() == Material.AIR) {
            player.sendMessage(UP_PREFIX + "§cВозьмите в руку предмет, который хотите отправить на сайт!");
            return;
        }

        Material mat = held.getType();
        int have = held.getAmount();
        int amount = 1;
        if (rawAmount != null) {
            if (rawAmount.equalsIgnoreCase("all")) {
                amount = have;
            } else {
                try {
                    amount = Integer.parseInt(rawAmount);
                } catch (NumberFormatException ex) {
                    player.sendMessage(UP_PREFIX + "§cКоличество должно быть целым числом или all.");
                    return;
                }
            }
        }
        if (amount <= 0) {
            player.sendMessage(UP_PREFIX + "§cКоличество должно быть больше 0.");
            return;
        }
        if (amount > have) {
            player.sendMessage(UP_PREFIX + "§cВ руке только §e" + have + "§c шт. этого предмета.");
            return;
        }

        Double durability = null;
        if (held.getItemMeta() instanceof Damageable dmg && dmg.hasDamage()) {
            int maxDur = mat.getMaxDurability();
            if (maxDur > 0) {
                durability = Math.max(0.01, 1.0 - ((double) dmg.getDamage() / maxDur));
            }
        }

        final Double finalDurability = durability;
        final int finalAmount = amount;
        final String itemId = mat.name().toLowerCase(Locale.ROOT);

        // Снимаем из руки игрока
        if (finalAmount >= have) {
            player.getInventory().setItemInMainHand(null);
        } else {
            held.setAmount(have - finalAmount);
            player.getInventory().setItemInMainHand(held);
        }

        player.sendMessage(UP_PREFIX + "§7Отправляем §e" + itemId + " §7(x" + finalAmount + ") на сайт...");

        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_mc_uuid", player.getUniqueId().toString());
                params.addProperty("p_mc_name", player.getName());
                params.addProperty("p_item_id", itemId);
                params.addProperty("p_count", finalAmount);
                if (finalDurability != null) {
                    params.addProperty("p_durability", finalDurability);
                }

                rpc("upgrader_plugin_deposit", params);
                runTask(() -> player.sendMessage(UP_PREFIX + "§a✓ Предмет §e" + itemId + " §a(x" + finalAmount + ") зачислен в ваш инвентарь на сайте!"));
            } catch (SiteException ex) {
                // При ошибке возвращаем предмет игроку
                runTask(() -> {
                    giveItem(player, mat, finalAmount, finalDurability);
                    player.sendMessage(UP_PREFIX + "§cНе удалось занести предмет: " + ex.getMessage());
                });
            }
        });
    }

    private void upgraderWithdraw(Player player) {
        if (!requireConfigured(player)) {
            return;
        }
        player.sendMessage(UP_PREFIX + "§7Проверяем выведенные с сайта предметы...");
        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_mc_uuid", player.getUniqueId().toString());
                JsonElement element = rpcElement("upgrader_plugin_claim_withdrawals", params);
                if (!element.isJsonArray()) {
                    runTask(() -> player.sendMessage(UP_PREFIX + "§cНеверный ответ от сайта."));
                    return;
                }
                JsonArray items = element.getAsJsonArray();
                if (items.size() == 0) {
                    runTask(() -> player.sendMessage(UP_PREFIX + "§7Нет предметов, ожидающих выдачи. Нажмите «Вывести в игру» в инвентаре на сайте."));
                    return;
                }
                runTask(() -> {
                    for (JsonElement itemElem : items) {
                        if (!itemElem.isJsonObject()) continue;
                        JsonObject obj = itemElem.getAsJsonObject();
                        String id = obj.has("item_id") ? obj.get("item_id").getAsString() : "";
                        int count = obj.has("count") ? obj.get("count").getAsInt() : 1;
                        Double dur = obj.has("durability") && !obj.get("durability").isJsonNull() ? obj.get("durability").getAsDouble() : null;

                        Material mat = Material.matchMaterial(id.toUpperCase(Locale.ROOT));
                        if (mat == null) {
                            getLogger().warning("Неизвестный материал для выдачи: " + id);
                            continue;
                        }
                        giveItem(player, mat, count, dur);
                        player.sendMessage(UP_PREFIX + "§a✓ Получен предмет с сайта: §e" + id + " §a(x" + count + ")");
                    }
                });
            } catch (SiteException ex) {
                runTask(() -> player.sendMessage(UP_PREFIX + "§cОшибка: " + ex.getMessage()));
            }
        });
    }

    private void upgraderBalance(Player player) {
        if (!requireConfigured(player)) {
            return;
        }
        player.sendMessage(UP_PREFIX + "§7Запрашиваем ваш инвентарь на сайте...");
        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_mc_uuid", player.getUniqueId().toString());
                JsonObject res = rpc("upgrader_plugin_get_inventory", params);
                boolean isLinked = res.has("linked") && res.get("linked").getAsBoolean();
                if (!isLinked) {
                    runTask(() -> player.sendMessage(UP_PREFIX + "§cАккаунт не привязан. Получите код на сайте и введите §e/up link КОД"));
                    return;
                }
                JsonArray inv = res.has("inventory") && res.get("inventory").isJsonArray()
                        ? res.getAsJsonArray("inventory") : new JsonArray();
                if (inv.size() == 0) {
                    runTask(() -> player.sendMessage(UP_PREFIX + "§7Инвентарь на сайте пуст. Возьмите предмет в руку и введите §e/up deposit"));
                    return;
                }
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < inv.size(); i++) {
                    JsonObject item = inv.get(i).getAsJsonObject();
                    if (i > 0) sb.append("§7, ");
                    sb.append("§e").append(item.get("id").getAsString()).append("§7(x").append(item.get("count").getAsInt()).append(")");
                }
                runTask(() -> {
                    player.sendMessage(UP_PREFIX + "§fИнвентарь на сайте (§e" + inv.size() + " слотов§f):");
                    player.sendMessage("§7" + sb.toString());
                });
            } catch (SiteException ex) {
                runTask(() -> player.sendMessage(UP_PREFIX + "§cОшибка: " + ex.getMessage()));
            }
        });
    }

    private void deliverUpgraderWithdrawals(Player player) {
        if (!isConfigured() || !player.isOnline()) return;
        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_mc_uuid", player.getUniqueId().toString());
                JsonElement element = rpcElement("upgrader_plugin_claim_withdrawals", params);
                if (element.isJsonArray()) {
                    JsonArray items = element.getAsJsonArray();
                    if (items.size() > 0) {
                        runTask(() -> {
                            for (JsonElement itemElem : items) {
                                if (!itemElem.isJsonObject()) continue;
                                JsonObject obj = itemElem.getAsJsonObject();
                                String id = obj.has("item_id") ? obj.get("item_id").getAsString() : "";
                                int count = obj.has("count") ? obj.get("count").getAsInt() : 1;
                                Double dur = obj.has("durability") && !obj.get("durability").isJsonNull() ? obj.get("durability").getAsDouble() : null;

                                Material mat = Material.matchMaterial(id.toUpperCase(Locale.ROOT));
                                if (mat != null) {
                                    giveItem(player, mat, count, dur);
                                    player.sendMessage(UP_PREFIX + "§a✓ Автодоставка с сайта: §e" + id + " §a(x" + count + ")");
                                }
                            }
                        });
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void link(Player player, String rawCode) {
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        if (code.length() != 6) {
            err(player, "Код состоит из 6 символов. Возьми его на сайте в профиле или разделе «Шахта».");
            return;
        }
        long now = System.currentTimeMillis();
        Long previous = lastLinkAttempt.get(player.getUniqueId());
        if (previous != null && now - previous < 3000) {
            err(player, "Слишком часто. Подожди пару секунд перед следующей попыткой.");
            return;
        }
        lastLinkAttempt.put(player.getUniqueId(), now);
        async(() -> {
            JsonObject params = new JsonObject();
            params.addProperty("p_code", code);
            params.addProperty("p_uuid", player.getUniqueId().toString());
            params.addProperty("p_name", player.getName());
            try {
                JsonObject result = rpc("mc_plugin_link", params);
                double ore = result.has("ore") ? result.get("ore").getAsDouble() : 0;
                linked.add(player.getUniqueId());
                runTask(() -> {
                    ok(player, "Аккаунт привязан к сайту. " + UNIT + " на сайте: §e" + ar(ore) + "§a.");
                    player.sendMessage(UP_PREFIX + "§aАпгрейдер готов к работе! Используйте §e/up deposit §aчтобы отправить предмет из руки на сайт.");
                });
            } catch (SiteException ex) {
                runTask(() -> err(player, ex.getMessage()));
            }
        });
    }

    private void deposit(Player player, String rawAmount) {
        int have = countOre(player);
        if (have <= 0) {
            err(player, "В инвентаре нет " + oreName() + ". Добудь руду и возвращайся.");
            return;
        }

        int amount;
        if (rawAmount == null || rawAmount.equalsIgnoreCase("all")) {
            amount = have;
        } else {
            try {
                amount = Integer.parseInt(rawAmount);
            } catch (NumberFormatException ex) {
                err(player, "Количество должно быть целым числом или all.");
                return;
            }
        }
        if (amount <= 0) {
            err(player, "Количество должно быть больше нуля.");
            return;
        }
        if (amount > have) {
            err(player, "В инвентаре только " + have + " " + oreName() + ".");
            return;
        }

        if (linked.contains(player.getUniqueId())) {
            doDeposit(player, amount);
            return;
        }

        msg(player, "Проверяю привязку...");
        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_uuid", player.getUniqueId().toString());
                JsonObject result = rpc("mc_plugin_sync", params);
                boolean isLinked = result.has("linked") && result.get("linked").getAsBoolean();
                if (!isLinked) {
                    runTask(() -> err(player, "Аккаунт не привязан. Открой «Шахту» на сайте, возьми код и введи /sw link КОД."));
                    return;
                }
                linked.add(player.getUniqueId());
                runTask(() -> doDeposit(player, amount));
            } catch (SiteException ex) {
                runTask(() -> err(player, "Сайт: " + ex.getMessage()));
            }
        });
    }

    /** Снимает руду и создаёт идемпотентный занос. Выполняется в главном потоке. */
    private void doDeposit(Player player, int amount) {
        if (!player.isOnline()) {
            return;
        }
        int removed = removeOre(player, amount);
        if (removed != amount) {
            if (removed > 0) {
                giveOre(player, removed, "отмена заноса");
            }
            err(player, "Инвентарь изменился, попробуй ещё раз.");
            return;
        }

        String nonce = UUID.randomUUID().toString();
        PendingDeposit pending = new PendingDeposit(
                player.getUniqueId(), player.getName(), amount, nonce, System.currentTimeMillis());
        pendingDeposits.put(nonce, pending);
        savePending();
        msg(player, "Заношу §e" + amount + "§7 " + oreName() + " (§e" + amount + " " + UNIT + "§7) на сайт...");
        sendDeposit(pending);
    }

    private void sendDeposit(PendingDeposit pending) {
        if (!depositInFlight.add(pending.nonce)) {
            return;
        }
        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_uuid", pending.playerId.toString());
                params.addProperty("p_amount", pending.amount);
                params.addProperty("p_nonce", pending.nonce);

                JsonObject result = rpc("mc_plugin_deposit", params);
                double ore = result.has("ore") ? result.get("ore").getAsDouble() : 0;
                pendingDeposits.remove(pending.nonce);
                savePending();

                Player player = Bukkit.getPlayer(pending.playerId);
                if (player != null) {
                    runTask(() -> ok(player, "Зачислено §e" + pending.amount + " " + UNIT
                            + "§a (1 руда = 1 АР). Всего на сайте: §e" + ar(ore) + " " + UNIT + "§a."));
                }
            } catch (SiteException ex) {
                if (ex.isDefinitive()) {
                    pendingDeposits.remove(pending.nonce);
                    addRefund(pending.playerId, pending.playerName, pending.amount);
                    savePending();
                    Player player = Bukkit.getPlayer(pending.playerId);
                    if (player != null) {
                        runTask(() -> {
                            giveOre(player, pending.amount, "возврат за отклонённый занос");
                            err(player, "Сайт отклонил занос: " + ex.getMessage() + " Руда возвращена.");
                        });
                    } else {
                        getLogger().warning("Занос " + pending.amount + " руды для " + pending.playerName
                                + " отклонён (" + ex.getMessage() + "), вернём при входе.");
                    }
                } else {
                    getLogger().warning("Сайт не ответил на занос " + pending.amount + " руды для "
                            + pending.playerName + ": " + ex.getMessage() + " — повторю автоматически.");
                    Player player = Bukkit.getPlayer(pending.playerId);
                    if (player != null) {
                        runTask(() -> msg(player, "Сайт не ответил. Повторю автоматически — руда уже снята, никуда не денется."));
                    }
                }
            } finally {
                depositInFlight.remove(pending.nonce);
            }
        });
    }

    private void ping(CommandSender sender) {
        if (!requireConfigured(sender)) {
            return;
        }
        long started = System.currentTimeMillis();
        async(() -> {
            try {
                JsonObject result = rpc("mc_plugin_ping", new JsonObject());
                long ms = System.currentTimeMillis() - started;
                String version = result.has("version") ? result.get("version").getAsString() : "?";
                runTask(() -> ok(sender, "Сайт на связи (" + ms + " мс), версия шахты " + version + "."));
            } catch (SiteException ex) {
                runTask(() -> err(sender, "Сайт: " + ex.getMessage()));
            }
        });
    }

    // ------------------------------------------------------------------
    // Синхронизация и выдача выводов
    // ------------------------------------------------------------------

    private void poll() {
        if (!isConfigured()) {
            return;
        }
        for (PendingDeposit pending : new ArrayList<>(pendingDeposits.values())) {
            sendDeposit(pending);
        }
        for (Player player : Bukkit.getOnlinePlayers()) {
            scanPlayerInventory(player);
            if (linked.contains(player.getUniqueId())) {
                syncPlayer(player, false, autoDeliver);
                if (autoDeliver) {
                    deliverUpgraderWithdrawals(player);
                }
            }
        }
    }

    private void syncPlayer(Player player, boolean announce, boolean deliver) {
        if (!isConfigured()) {
            if (announce) {
                err(player, notConfiguredMessage());
            }
            return;
        }
        UUID playerId = player.getUniqueId();
        if (!syncInFlight.add(playerId)) {
            return;
        }

        async(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("p_uuid", playerId.toString());
                JsonObject result = rpc("mc_plugin_sync", params);

                boolean isLinked = result.has("linked") && result.get("linked").getAsBoolean();
                if (!isLinked) {
                    linked.remove(playerId);
                    if (announce) {
                        runTask(() -> err(player, "Аккаунт не привязан. Открой «Шахту» на сайте, возьми код и введи /sw link КОД."));
                    }
                    return;
                }

                linked.add(playerId);
                double ore = result.has("ore") ? result.get("ore").getAsDouble() : 0;
                JsonArray withdrawals = result.has("withdrawals") && result.get("withdrawals").isJsonArray()
                        ? result.getAsJsonArray("withdrawals") : new JsonArray();

                if (announce) {
                    runTask(() -> msg(player, "АР на сайте: §e" + ar(ore) + "§7. Готовых выводов руды: §e"
                            + withdrawals.size() + "§7."));
                }

                if (deliver && withdrawals.size() > 0) {
                    for (JsonElement element : withdrawals) {
                        if (!element.isJsonObject()) {
                            continue;
                        }
                        JsonObject withdrawal = element.getAsJsonObject();
                        if (!withdrawal.has("id") || !withdrawal.has("amount")) {
                            continue;
                        }
                        deliverWithdrawal(player, withdrawal.get("id").getAsString(),
                                withdrawal.get("amount").getAsInt());
                    }
                }
            } catch (SiteException ex) {
                if (announce) {
                    runTask(() -> err(player, "Сайт: " + ex.getMessage()));
                } else if (debug) {
                    getLogger().info("sync " + player.getName() + ": " + ex.getMessage());
                }
            } finally {
                syncInFlight.remove(playerId);
            }
        });
    }

    private void deliverWithdrawal(Player player, String withdrawalId, int amount) {
        Boolean hasSpace;
        try {
            hasSpace = Bukkit.getScheduler().callSyncMethod(this, () -> hasSpace(player, amount))
                    .get(10, TimeUnit.SECONDS);
        } catch (Exception ex) {
            getLogger().warning("Не смог проверить инвентарь " + player.getName() + ": " + ex.getMessage());
            return;
        }

        if (!Boolean.TRUE.equals(hasSpace)) {
            runTask(() -> err(player, "Не хватает места для §e" + amount + "§c " + UNIT
                    + " (" + oreName() + "). Освободи слоты — выдача повторится сама."));
            return;
        }

        try {
            JsonObject params = new JsonObject();
            params.addProperty("p_id", withdrawalId);
            JsonObject result = rpc("mc_plugin_withdraw_claim", params);
            if (!result.has("ok") || !result.get("ok").getAsBoolean()) {
                if (debug) {
                    getLogger().info("Заявка " + withdrawalId + " уже не pending: " + result);
                }
                return;
            }
            int got = result.has("amount") ? result.get("amount").getAsInt() : amount;
            runTask(() -> {
                giveOre(player, got, "вывод с сайта");
                ok(player, "Выдано §e" + got + "§a " + oreName() + " (" + got + " " + UNIT + ") с сайта.");
            });
        } catch (SiteException ex) {
            getLogger().warning("Не смог забрать вывод " + withdrawalId + " для " + player.getName() + ": " + ex.getMessage());
            runTask(() -> err(player, "Вывод не забрался: " + ex.getMessage()));
        }
    }

    // ------------------------------------------------------------------
    // Инвентарь (только главный поток)
    // ------------------------------------------------------------------

    private int countOre(Player player) {
        int count = 0;
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack != null && stack.getType() == oreMaterial) {
                count += stack.getAmount();
            }
        }
        return count;
    }

    private int removeOre(Player player, int amount) {
        int remaining = amount;
        ItemStack[] contents = player.getInventory().getStorageContents();
        for (int slot = 0; slot < contents.length && remaining > 0; slot++) {
            ItemStack stack = contents[slot];
            if (stack == null || stack.getType() != oreMaterial) {
                continue;
            }
            int take = Math.min(remaining, stack.getAmount());
            if (take == stack.getAmount()) {
                player.getInventory().setItem(slot, null);
            } else {
                stack.setAmount(stack.getAmount() - take);
                player.getInventory().setItem(slot, stack);
            }
            remaining -= take;
        }
        return amount - remaining;
    }

    private boolean hasSpace(Player player, int amount) {
        int space = 0;
        int maxStack = Math.max(1, oreMaterial.getMaxStackSize());
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack == null || stack.getType() == Material.AIR) {
                space += maxStack;
            } else if (stack.getType() == oreMaterial) {
                space += Math.max(0, maxStack - stack.getAmount());
            }
        }
        return space >= amount;
    }

    private void giveOre(Player player, int amount, String reason) {
        giveItem(player, oreMaterial, amount, null);
        if (debug) {
            getLogger().info("Выдано " + amount + " x " + oreMaterial + " игроку " + player.getName() + " (" + reason + ")");
        }
    }

    private void giveItem(Player player, Material material, int amount, Double durability) {
        int remaining = amount;
        int maxStack = Math.max(1, material.getMaxStackSize());
        while (remaining > 0) {
            int stackSize = Math.min(maxStack, remaining);
            ItemStack item = new ItemStack(material, stackSize);
            if (durability != null && item.getItemMeta() instanceof Damageable dmg) {
                int maxDur = material.getMaxDurability();
                if (maxDur > 0) {
                    dmg.setDamage((int) Math.round((1.0 - durability) * maxDur));
                    item.setItemMeta(dmg);
                }
            }
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(item);
            for (ItemStack drop : leftover.values()) {
                player.getWorld().dropItemNaturally(player.getLocation(), drop);
            }
            remaining -= stackSize;
        }
    }

    private static String ar(double value) {
        if (Math.abs(value - Math.rint(value)) < 0.005) {
            return String.valueOf((long) Math.rint(value));
        }
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private String oreName() {
        return oreMaterial == Material.DIAMOND_ORE ? "алмазной руды" : oreMaterial.name().toLowerCase(Locale.ROOT);
    }

    // ------------------------------------------------------------------
    // HTTP / PostgREST
    // ------------------------------------------------------------------

    private JsonElement rpcElement(String function, JsonObject params) throws SiteException {
        if (!isConfigured()) {
            throw new SiteException(notConfiguredMessage(), true);
        }
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(URI.create(siteUrl + "/rest/v1/rpc/" + function))
                    .timeout(Duration.ofSeconds(15))
                    .header("apikey", serviceKey)
                    .header("Authorization", "Bearer " + serviceKey)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(params)))
                    .build();
        } catch (RuntimeException ex) {
            throw new SiteException("некорректный supabase-url в config.yml", true);
        }

        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            String body = response.body() == null ? "" : response.body();

            if (status < 200 || status >= 300) {
                String message = "HTTP " + status;
                boolean definitive = status >= 400 && status < 500 && status != 429;
                try {
                    JsonObject error = JsonParser.parseString(body).getAsJsonObject();
                    if (error.has("message")) {
                        message = error.get("message").getAsString();
                    } else if (error.has("hint")) {
                        message = error.get("hint").getAsString();
                    }
                } catch (RuntimeException ignored) {
                    if (!body.isEmpty() && body.length() < 200) {
                        message += ": " + body;
                    }
                }
                if (status == 404 || body.contains("PGRST202")) {
                    message = "SQL функция " + function + " не найдена на сайте";
                }
                if (debug) {
                    getLogger().warning("RPC " + function + " -> " + status + " " + body);
                }
                throw new SiteException(message, definitive);
            }

            return JsonParser.parseString(body);
        } catch (java.io.IOException ex) {
            throw new SiteException("нет связи с сайтом", false);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new SiteException("запрос прерван", false);
        }
    }

    private JsonObject rpc(String function, JsonObject params) throws SiteException {
        JsonElement element = rpcElement(function, params);
        if (!element.isJsonObject()) {
            throw new SiteException("сайт вернул неожиданный ответ", false);
        }
        return element.getAsJsonObject();
    }

    // ------------------------------------------------------------------
    // Мелочи
    // ------------------------------------------------------------------

    private boolean requireConfigured(CommandSender sender) {
        if (isConfigured()) {
            return true;
        }
        err(sender, notConfiguredMessage());
        return false;
    }

    private String notConfiguredMessage() {
        return "Плагин не настроен: вставь service-key в plugins/SwinlineMine/config.yml и перезапусти сервер.";
    }

    private void addRefund(UUID playerId, String playerName, int amount) {
        refunds.merge(playerId, new Refund(playerId, playerName, amount),
                (first, second) -> new Refund(playerId, playerName, first.amount + second.amount));
    }

    private void runTask(Runnable task) {
        if (isEnabled()) {
            getServer().getScheduler().runTask(this, task);
        }
    }

    private void async(Runnable task) {
        if (isEnabled()) {
            getServer().getScheduler().runTaskAsynchronously(this, task);
        }
    }

    private static void msg(CommandSender sender, String message) {
        sender.sendMessage(PREFIX + "§7" + message);
    }

    private static void ok(CommandSender sender, String message) {
        sender.sendMessage(PREFIX + "§a" + message);
    }

    private static void err(CommandSender sender, String message) {
        sender.sendMessage(PREFIX + "§c" + message);
    }

    private static String[] dropFirst(String[] arr) {
        if (arr.length <= 1) return new String[0];
        String[] result = new String[arr.length - 1];
        System.arraycopy(arr, 1, result, 0, result.length);
        return result;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        String cmd = command.getName().toLowerCase(Locale.ROOT);
        if (cmd.equals("up") || cmd.equals("upgrader") || cmd.equals("upgrade") || alias.equalsIgnoreCase("up")) {
            if (args.length == 1) {
                return filter(List.of("deposit", "withdraw", "balance", "sync", "link", "help"), args[0]);
            }
            if (args.length == 2 && (args[0].equalsIgnoreCase("deposit") || args[0].equalsIgnoreCase("dep"))) {
                return filter(List.of("1", "all"), args[1]);
            }
            return List.of();
        }

        if (args.length == 1) {
            return filter(List.of("link", "deposit", "balance", "withdraw", "up", "ping", "help"), args[0]);
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("deposit")) {
            return filter(List.of("all"), args[1]);
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("up")) {
            return filter(List.of("deposit", "withdraw", "balance", "sync", "link", "help"), args[1]);
        }
        return List.of();
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix.toLowerCase(Locale.ROOT);
        List<String> result = new ArrayList<>();
        for (String option : options) {
            if (option.toLowerCase(Locale.ROOT).startsWith(lower)) {
                result.add(option);
            }
        }
        return result;
    }

    private record PendingDeposit(UUID playerId, String playerName, int amount, String nonce, long createdAt) {
    }

    private record Refund(UUID playerId, String playerName, int amount) {
    }

    private static final class SiteException extends Exception {
        private final boolean definitive;

        SiteException(String message, boolean definitive) {
            super(message);
            this.definitive = definitive;
        }

        boolean isDefinitive() {
            return definitive;
        }
    }
}
