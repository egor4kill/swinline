#!/usr/bin/env bash
# Сборка без Maven/Gradle: качает Paper API и Gson, компилирует javac, собирает jar.
# Требуется JDK 17+.
set -euo pipefail
cd "$(dirname "$0")"

API_VERSION="1.20.4-R0.1-20240423.152506-123"
API_JAR="spigot-api-${API_VERSION}.jar"
GSON_VERSION="2.10.1"
GSON_JAR="gson-${GSON_VERSION}.jar"

mkdir -p .lib build/classes

if [ ! -f ".lib/$API_JAR" ]; then
  echo "Скачиваю Spigot API 1.20.4..."
  curl -fsSL -o ".lib/$API_JAR" \
    "https://repo.papermc.io/repository/maven-public/org/spigotmc/spigot-api/1.20.4-R0.1-SNAPSHOT/$API_JAR"
fi

if [ ! -f ".lib/$GSON_JAR" ]; then
  echo "Скачиваю Gson $GSON_VERSION..."
  curl -fsSL -o ".lib/$GSON_JAR" \
    "https://repo1.maven.org/maven2/com/google/code/gson/gson/$GSON_VERSION/$GSON_JAR"
fi

SEP=':'
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) SEP=';' ;;
esac
CLASS_PATH=".lib/$API_JAR${SEP}.lib/$GSON_JAR"

rm -rf build/classes
mkdir -p build/classes
find src/main/java -name '*.java' > build/sources.txt

javac --release 17 -encoding UTF-8 -cp "$CLASS_PATH" -d build/classes @build/sources.txt
cp src/main/resources/plugin.yml src/main/resources/config.yml build/classes/

jar --create --file build/SwinlineMine.jar -C build/classes .

echo "Готово: minecraft-plugin/build/SwinlineMine.jar"
