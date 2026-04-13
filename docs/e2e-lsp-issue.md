# E2E LSP-тесты не работают: несовместимость opencode v1.4.3 и typescript-language-server v5.x

## Summary

E2E-тест `lsp-goto-definition.test.ts` не работает: LSP-инструмент opencode всегда возвращает
`No results found for goToDefinition` вместо реального перехода к определению символа. Причина —
несовместимость CLI-аргументов, которые opencode v1.4.3 передаёт `typescript-language-server`, с
версией 5.x этого сервера.

## Затронутые тесты

| Тест | Что проверяет | Статус |
|------|---------------|--------|
| `tests/e2e/lsp-goto-definition.test.ts` | Связка symbol-finder → LSP goToDefinition для перехода к определению `calculateSum` из `main.ts` в `math.ts` | FAIL |
| `tests/e2e/opencode-tool.test.ts` | Custom tool symbol-finder внутри opencode (поиск символа `add` в `calculator.ts`) | PASS |

## Симптомы

При вызове LSP tool с операцией `goToDefinition`:

1. TypeScript LSP-сервер запускается, но **немедленно падает** с ошибкой:
   ```
   error: unknown option '--tsserver-log-verbosity'
   ```
2. LSP-клиент opencode ждёт ответа на `initialize` **45 секунд**, затем таймаутится:
   ```
   ERROR service=lsp.client serverID=typescript error=Operation timed out after 45000ms initialize error
   ```
3. LSP tool возвращает пустой результат: `No results found for goToDefinition`
4. Тест не находит ожидаемый файл `math.ts` в ответе — **FAIL**

## Root Cause

### Механизм запуска TypeScript LSP в opencode v1.4.3

Opencode v1.4.3 запускает TypeScript Language Server следующим кодом (извлечено из бинарника):

```javascript
const bin = await Npm.which("typescript-language-server");
if (!bin) return;
const args = [
  "--stdio",
  "--tsserver-log-verbosity", "off",   // ← удалено в v4.0
  "--tsserver-path", tsserver,          // ← удалено в v4.0
];
```

Функция `Npm.which("typescript-language-server")` резолвит пакет **без указания версии** —
используется npm arborist с `save: true`, который устанавливает **последнюю версию** из registry.

### Что изменилось в typescript-language-server

| Версия | CLI-аргументы `--tsserver-log-verbosity` и `--tsserver-path` |
|--------|---------------------------------------------------------------|
| ≤ 3.x  | Поддерживаются (с пометкой deprecated)                       |
| ≥ 4.0  | **Полностью удалены**. Путь к tsserver передаётся через `initializationOptions.tsserver.path` |

Начиная с v4.0 сервер использует `commander` для парсинга аргументов и строго валидирует опции.
Неизвестный аргумент приводит к `error: unknown option` и немедленному завершению процесса.

### Почему проблема проявилась не сразу

Opencode v1.3.9 и ранее запускали LSP-сервер через `bun x typescript-language-server`:
```javascript
spawn(BunProc.which(), ["x", "typescript-language-server", "--stdio"], { ... })
```
Bun runtime при запуске через `bun x` передавал неизвестные CLI-аргументы как позиционные,
и сервер их **молча игнорировал**.

В v1.4.0+ после рефакторинга (#18308) запуск изменился на прямое использование бинарника
через `Npm.which()` — и неизвестные опции стали вызывать фатальную ошибку.

### Почему v1.4.3 содержит устаревшие аргументы

В публичном репозитории opencode (ветка `dev`) коммиты с `Npm.which()` **не содержат**
аргументов `--tsserver-log-verbosity` / `--tsserver-path` — только `["--stdio"]`. Однако
бинарник v1.4.3 скомпилирован из закрытой ветки сборки, в которую эти аргументы попали.
Текущая публичная версия `dev` по-прежнему использует `BunProc.which()`, т.е. не содержит
данного рефакторинга вообще.

## Workaround

Установка совместимой версии `typescript-language-server@3.3.1` в кэш opencode:

```bash
rm -rf ~/.cache/opencode/packages/typescript-language-server
mkdir -p ~/.cache/opencode/packages/typescript-language-server
cd ~/.cache/opencode/packages/typescript-language-server
npm init -y
npm install typescript-language-server@3.3.1
```

После этого `Npm.which()` находит бинарник v3.3.1 в кэше и не скачивает новую версию.
Оба e2e-теста проходят:

```
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
```

### Ограничения workaround'а

- **Хрупкость**: при обновлении opencode (изменение `CACHE_VERSION`) директория
  `~/.cache/opencode/` полностью очищается и пересоздаётся — фиксация версии теряется.
- **Не воспроизводимо на других машинах**: каждый разработчик должен вручную установить
  нужную версию в кэш.

## Варианты исправления

### Вариант 1: Откатиться на opencode v1.3.9

Последняя версия, использующая `bun x` для запуска LSP-серверов.

```bash
opencode upgrade 1.3.9 --method npm
```

**Плюсы:**
- Полностью устраняет проблему (bun игнорирует неизвестные аргументы)
- Не требует поддержки в тестах

**Минусы:**
- Потеря фиксов и улучшений из v1.4.x
- Возврат к `bun x` — не предполагаемый путь развития opencode

### Вариант 2: Зафиксировать версию в кэше (текущий workaround)

Ручная установка `typescript-language-server@3.3.1` в `~/.cache/opencode/packages/`.

**Плюсы:**
- Быстро, не требует изменений в коде

**Минусы:**
- Теряется при обновлении opencode (очистка кэша)
- Не воспроизводимо на CI/других машинах
- Не масштабируется при появлении аналогичных проблем с другими LSP-серверами

### Вариант 3 (рекомендуемый): Установка версии в `beforeAll` e2e-теста

Добавить в `lsp-goto-definition.test.ts` явную установку совместимой версии перед запуском
тестов:

```typescript
beforeAll(async () => {
  const cacheDir = path.join(os.homedir(), ".cache", "opencode", "packages", "typescript-language-server");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, "package.json"),
    JSON.stringify({ dependencies: { "typescript-language-server": "3.3.1" } }, null, 2),
  );
  await execCommand("npm install", { cwd: cacheDir });
}, 60_000);
```

**Плюсы:**
- Тест самодостаточен — работает на любой машине и CI
- Не зависит от глобального состояния кэша
- Выживет при обновлении opencode
- Не блокирует использование v1.4.x

**Минусы:**
- Увеличивает время выполнения теста (~2-3 сек на `npm install`, если кэш уже есть)
- Связывает тест с конкретной версией `typescript-language-server`

## Рекомендация

**Вариант 3** — самый надёжный подход. Дополнительно стоит:

1. Завести issue в opencode (https://github.com/anomalyco/opencode/issues) об удалении
   устаревших CLI-аргументов `--tsserver-log-verbosity` и `--tsserver-path` из бинарника.
   В актуальном публичном исходном коде (`dev`) этих аргументов уже нет — проблема только
   в бинарнике v1.4.3.
2. После выхода исправленной версии opencode — убрать установку конкретной версии из теста.

## Environment

| Компонент | Версия |
|-----------|--------|
| OS | Linux x86_64 |
| Node.js | v24.13.0 |
| opencode | v1.4.3 (latest available) |
| typescript (в проекте) | 6.0.2 |
| typescript-language-server (в кэше) | 5.1.3 → 3.3.1 (workaround) |
| Установка opencode | npm (`opencode-ai@1.4.3`), бинарник `opencode-linux-x64` |
