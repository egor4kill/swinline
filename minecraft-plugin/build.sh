#!/usr/bin/env bash
# Сборка без Maven/Gradle: качает Paper API и Gson, компилирует javac, собирает jar.
# Требуется JDK 17+.
set -euo pipefail
cd "$(dirname "$0")"

API_VERSION="26.3-R0.1-20261026.080323-10"
API_JAR="spigot-api-${API_VERSION}.jar"
GSON_VERSION="2.14.0"
GSON_JAR="gson-${GSON_VERSION}.jar"

mkdir -p .lib build/classes

if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  JAVAC="$JAVA_HOME/bin/javac"
  JAR="$JAVA_HOME/bin/jar"
else
  JAVAC="javac"
  JAR="jar"
fi

if ! "$JAVAC" -version 2>&1 | grep -qE 'javac (2[1-9]|[3-9][0-9])'; then
  echo "Нужен JDK 21+. Укажи JAVA_HOME=/путь/к/jdk-21+ (например, JDK 25) и повтори."
  exit 1
fi

if [ ! -f ".lib/$API_JAR" ]; then
  echo "Скачиваю Spigot API 26.3..."
  curl -fsSL -o ".lib/$API_JAR" \
    "https://repo.papermc.io/repository/maven-public/org/spigotmc/spigot-api/26.3-R0.1-SNAPSHOT/$API_JAR"
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

"$JAVAC" --release 21 -encoding UTF-8 -cp "$CLASS_PATH" -d build/classes @build/sources.txt
cp src/main/resources/plugin.yml src/main/resources/config.yml build/classes/

"$JAR" --create --file build/SwinlineMine.jar -C build/classes .

echo "Готово: minecraft-plugin/build/SwinlineMine.jar"
