# 01. Ограничения Plugin API: отмена LSP и повторные вызовы

- **Дата:** 2026-09-15
- **Версия opencode:** 1.18.31 (исследование выполнено по checkout `../opencode`)
- **Статус:** исследование завершено; задача 1 требует реализации, задача 2 заблокирована отсутствием API
- **Затронутые файлы:** `src/semantic-lsp-plugin.ts`, `src/semantic-lsp-transformer/SemanticLspTransformer.ts`

## Описание проблемы

Текущий плагин подменяет координаты `line`/`character` встроенного `lsp` tool результатами поиска символа. При этом остаются две нерешенные проблемы.

### 1. Символ не найден

Если finder не смог найти символ, `tool.execute.before` все равно подставляет `line: 1`, `character: 1`, передает эти значения встроенному `lsp` tool и лишь в `tool.execute.after` полностью заменяет ответ сообщением об ошибке (`src/semantic-lsp-plugin.ts:191-208`, `src/semantic-lsp-plugin.ts:219-226`).

Из-за этого:

- выполняется запрос разрешения на `lsp`;
- opencode открывает или обновляет документ в LSP-сервере;
- отправляется заведомо некорректный LSP-запрос;
- tool part завершается со статусом `completed`, хотя семантически вызов был ошибочным;
- текст ошибки появляется только после фактического выполнения `lsp`.

Требуется отменить встроенный вызов и вернуть ошибку сразу после определения, что символ найти невозможно.

### 2. Найдено несколько совпадений

Когда алгоритм находит несколько возможных позиций, плагин выбирает первую позицию и добавляет warning о неточности запроса. Пользовательский сценарий хочет автоматически вызывать LSP для всех совпадений и, если все они указывают на один и тот же файл, возвращать результат без warning.

Необходимо проверить, может ли хук `tool.execute.before` или `tool.execute.after` самостоятельно выполнить встроенный `lsp` tool несколько раз и объединить результаты до завершения текущего tool call.

## Результаты исследования

### Явного API отмены нет

В Plugin API хук `tool.execute.before` принимает только изменяемый объект `args` (`../opencode/packages/plugin/src/index.ts:266-281`). В нем нет полей `cancel`, `stop`, `skip` или аналогичного сигнала, а OpenCode после хука безусловно продолжает `item.execute` (`../opencode/packages/opencode/src/session/tools.ts:102-111`).

Поэтому заменить вызов встроенного инструмента через какую-либо замену `output.args` нельзя:

- установка `output.args = undefined` не изменяет captured в замыкании значение `args`;
- очистка или замена полей `args` только передает встроенному инструменту другой некорректный ввод;
- хук не получает функцию запуска оригинального tool.

### Штатный способ отмены — исключение из хука

Документированный OpenCode-механизм предотвращения инструмента — `throw new Error(...)` из `tool.execute.before`. Официальный пример [.env protection](https://opencode.ai/docs/plugins/#env-protection) именно так блокирует чтение файла.

Механика выполнения подтверждается исходниками:

1. `Plugin.trigger` последовательно вызывает все хуки внутри `Effect.promise` (`../opencode/packages/opencode/src/plugin/index.ts:284-297`).
2. Rejected Promise прерывает Effect до `item.execute` (`../opencode/packages/opencode/src/session/tools.ts:102-111`).
3. OpenCode преобразует ошибку в `tool-error` и переводит tool part в статус `error` (`../opencode/packages/opencode/src/session/processor.ts:186-205`, `../opencode/packages/opencode/src/session/processor.ts:416-418`).
4. На следующем обращении к модели ошибка передается как `output-error.errorText` (`../opencode/packages/opencode/src/session/message-v2.ts:325-347`).

Это не является хуком или внутренним механизмом: отмена через исключение входит в официальный контракт Plugin API.

### Рекурсивный вызов LSP из хука невозможен

Хуки `tool.execute.before` и `tool.execute.after` окружают ровно одно выполнение уже выбранного моделью tool call. Они не позволяют запустить встроенный `lsp` tool повторно, потому что:

- в хук не передается `ToolContext` и функция `item.execute`;
- AI SDK/model loop контролирует порождение новых tool calls;
- плагин может изменить `args` текущего вызова, но не может создать новый tool call внутри текущего вызова.

Объект `client`, доступный плагину, тоже не предоставляет выполнения инструментов:

- `client.tool.list()` — получение JSON Schema определений (`../opencode/packages/sdk/js/src/gen/sdk.gen.ts:373-393`);
- `client.tool.ids()` — получение идентификаторов инструментов (`../opencode/packages/sdk/js/src/gen/sdk.gen.ts:373-393`);
- `client.lsp.status()` — получение статуса LSP-серверов (`../opencode/packages/sdk/js/src/gen/sdk.gen.ts:976-986`);
- публичных маршрутов `POST /tool/execute`, `POST /experimental/tool/execute` или аналогичных в текущем HTTP API нет.

Существующие команды `opencode debug lsp` также не подходят: они предоставляют diagnostics и поиск workspace/document symbols, но не полный набор `goToDefinition`, `findReferences`, `hover`, call hierarchy и другие операции, используемые `lsp` tool.

### Переопределение `lsp` не решает задачу через обертку

OpenCode позволяет плагину объявить custom tool с именем `lsp`, и такой инструмент имеет приоритет над встроенным. Однако переопределение не дает доступа к оригинальному `execute` встроенного инструмента: registry регистрирует plugin tool и заменяет встроенный инструмент целиком (`../opencode/packages/opencode/src/tool/registry.ts:199-204`, `../opencode/packages/opencode/src/tool/registry.ts:229-258`).

Чтобы custom tool сам опрашивал несколько позиций, плагину пришлось бы самостоятельно:

- читать конфигурацию LSP-серверов;
- разрешать бинары и аргументы запуска;
- запускать и инициализировать серверы;
- открывать документы;
- выполнять каждый LSP-запрос;
- управлять завершением, сбоями и кэшированием;
- воспроизводить разрешения и метаданные встроенного `lsp` tool.

Такой путь технически возможен, но дублирует LSP-подсистему opencode, может конфликтовать с уже запущенными серверами и перестает быть честной оберткой над родным `lsp` tool.

## Варианты решения

### Задача 1: немедленная ошибка без вызова LSP

Рекомендуется использовать штатный `throw new Error(...)` из `tool.execute.before`.

Предлагаемая логика:

1. Прочитать файл и выполнить finder.
2. Отформатировать результат.
3. Если есть errors:
   - не подставлять `line`/`character`;
   - не записывать call ID в cache, либо удалить его до исключения;
   - выбросить `Error` со сформированным сообщением для модели.
4. Вызов `lsp` продолжить только при отсутствии errors.
5. В `tool.execute.after` оставить только обработку warnings.

Пример целевой ветки:

```ts
const finderResult = finder.find({
  code,
  symbol: args.symbol ?? "",
  fragment: args.fragment ?? "",
  bestEffort: true,
});

const lspResult = formatter.format(finderResult);

if (lspResult.errors.length > 0) {
  cache.delete(input.callID);
  throw new Error(formatErrorMessage(lspResult.errors));
}

cache.set(input.callID, lspResult);

const resolved = finderResult.matches[0];
delete output.args.symbol;
delete output.args.fragment;
output.args.line = resolved.position.line;
output.args.character = resolved.position.column;
```

Ключевое требование — `cache.delete(input.callID)` перед `throw`: при отмене `tool.execute.after` не вызывается, и иначе cache будет расти.

### Задача 2: проверка всех совпадений

Без расширения Plugin API решение в рамках одного tool call невозможно.

Допустимые варианты:

| Вариант | Возможность | Оценка |
|---|---:|---|
| Опросить кандидатов из `tool.execute.before` | Нет | API не позволяет вызывать tools или LSP-операции |
| Опросить кандидатов из `tool.execute.after` | Нет | Хук выполняется после одного завершенного вызова |
| Заставить модель сделать несколько tool calls | Да, косвенно | Требует дополнительных ответов модели, разрешений и стабильной инструкции; не является автоматическим fan-out хука |
| Переопределить `lsp` и запустить собственный LSP-клиент | Технически да | Дублирует LSP lifecycle/config/permissions и ненадежно для разных языков |
| Добавить upstream API | Да | Наиболее честный путь |

Безопасный временный вариант:

- сохранять warning для всех операций, где позиция определяет результат: `goToDefinition`, `findReferences`, `hover`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`;
- не показывать warning только для операций, где позиция не влияет на запрос: `workspaceSymbol` и `documentSymbol`;
- запрещать автоматическое подавление warning по совпадению имени символа или исходного файла, потому что из одного исходного файла разные позиции могут вести к разным определениям, overload'ам, declarations и implementations.

Для полноценного решения upstream требуется один из API:

1. `client.lsp.definition/references/hover/...` с параметрами позиции;
2. `client.tool.execute("lsp", args, options)` с контролем разрешений;
3. внутренний tool-execution API для плагинов, позволяющий выполнить несколько read-only операций в рамках уже разрешенного основного вызова.

Тогда плагин сможет параллельно опросить кандидатов, извлечь `uri`/`targetUri` из результатов и подавить warning только при доказанном совпадении файла перехода.

## Рекомендуемая backlog-последовательность

1. Реализовать немедленную отмену через `throw` при ошибках finder.
2. Удалить post-facto перезапись успешного ответа в `tool.execute.after`; оставить там только предупреждения.
3. Добавить unit-тесты на отсутствие mutation `line`/`character`, очистку cache и текст ошибки.
4. Подавить multiple-matches warning только для `workspaceSymbol` и `documentSymbol`.
5. Для остальных операций сохранить текущий warning до появления upstream LSP/tool execution API.
6. Завести upstream issue с запросом `client.lsp` или `client.tool.execute`.

## Критерии приемки для задачи 1

1. При `FILE_NOT_FOUND`, `NO_MATCHES` и других errors встроенный `lsp` tool не вызывается.
2. Модель получает статус tool part `error`, а не `completed` с переписанным текстом.
3. Сообщение ошибки содержит код проблемы, причину и рекомендацию для повторного вызова.
4. Cache по `callID` не остается после исключения.
5. При одном успешном совпадении поведение не меняется.
6. При нескольких совпадениях первый кандидат по-прежнему отправляется в LSP, а warning сохраняется для позиционно-зависимых операций.

## Рамки и риски

- Исключение останавливает выполнение остальных `tool.execute.before` hooks, поэтому наш плагин должен выбрасывать ошибку только для `toolID === "lsp"` и только при невосстановимой ошибке finder.
- Исключение возвращает модели текстовую ошибку; дополнительные fields `title`/`metadata` через before hook задать нельзя.
- Решение задачи 2 нельзя корректно реализовать только внутри Plugin API текущей версии OpenCode.
