# Tiến độ: EventBridge (+Scheduler), Secrets Manager + SSM

> Sổ tay cho job làm tự động (mỗi ~3h). Cập nhật cuối: 2026-11-20 (lần chạy 3). Làm trên `dev`, chưa commit.
> Thứ tự: EventBridge xong hết "Thứ tự làm" và test pass rồi mới sang Secrets + SSM.

## Đã port sang UI mới của `dev` (sau khi user pull, 2026-11-20)

Pull sạch, không conflict. Phần phải đổi:

- `index.tsx`: icon Tabler (`IconCalendarEvent`), `category: "integration"`, route `lazyPage`; bỏ `iconPath`, `quickLinks`, `useResourceCount`; xóa `web/public/icons/eventbridge.svg`.
- Trang chi tiết và form sửa (`RuleDetail`, `RuleForm`, `ScheduleDetail`, `ScheduleForm`) dùng `pageState` thay cho Spinner / NotFound / ErrorState tự ghép.
- Thẻ **Connect** (code mẫu Node.js + Python): `codeSamples.ts` (`ruleSample` gửi event lên bus của rule, `scheduleSample` tạo schedule giống schedule này), hiện ở tab Details của rule và trang chi tiết schedule. Bus không có trang chi tiết nên không có thẻ.
- `npm install` trong WSL để có `@tabler/icons-react`, `@cloudscape-design/code-view` (đã có trong `package.json` do `dev`).
- Sửa bug lộ ra khi đổi thời điểm render: sau khi xóa rule / schedule ở trang chi tiết, `removeQueries` làm observer tạo lại query và gọi resource vừa xóa (404). Thay bằng `invalidateExcept` (loại query chi tiết của resource đã xóa khỏi đợt làm mới) trong `useBuses.ts`.
- README: thêm dòng EventBridge vào bảng tính năng, bỏ khỏi "More services coming"; `docs/development.md` (Traps) thêm mục về giới hạn pattern của Floci.
- Test sau khi port: typecheck sạch, unit 240, IT 21/21 (`eventbridge*`), E2E 9/9 (chạy 2 lần), responsive 20/20.

## Đang làm: EventBridge — spec mục 8

| Bước                                   | Trạng thái                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Icon, registry, client              | Xong (`useEventBridge`; `useScheduler` làm ở bước 5, chưa cần)                            |
| 2. Event buses: list, tạo, xóa, Send   | Xong, đã test UI 1440 + 390, IT, E2E, responsive                                          |
| 3. Rules: list, tạo / sửa, Test pattern, enable/disable, xóa | Xong, đã test UI 1440 + 390, IT, E2E, responsive |
| 4. Chi tiết rule: tab Targets (Lambda, SQS, SNS), tab Details | Xong (thêm / gỡ target; Step Functions để bước 7) |
| 5. Schedules: list + group, tạo / sửa (`at`, `rate`, `cron`), chi tiết, enable/disable, xóa | Xong, đã test UI 1440 + 390, IT, E2E, responsive |
| 6. Liên kết Lambda / SQS / SNS | Xong, đã test UI 1440 + 390, unit, IT, E2E, responsive toàn app |
| 7. Target Step Functions | Xong (2026-11-22): dropdown state machine ở Add target và form Schedule, link sang trang state machine; rule không cần RoleArn, schedule dùng role mặc định |
| 8. Test cuối | Một phần: `it/eventbridge*.test.ts`, `e2e/eventbridge*.spec.ts`, 3 trang trong `responsive.spec.ts` |

### File đã tạo / sửa (để tách stash)

- Mới: `web/src/services/eventbridge/` (`index.tsx`, `routes.ts`, `constants.ts`, `schemas.ts`, `buses.ts`, `rules.ts`, `hooks/useEventBridge.ts`, `hooks/useBuses.ts`, `pages/BusList.tsx`, `components/{CreateBusModal,DeleteBusesModal,SendEventsModal}.tsx`), `web/public/icons/eventbridge.svg`, `web/test/services/eventbridge/schemas.test.ts`, `tests/it/eventbridge.test.ts`, `tests/e2e/eventbridge.spec.ts`.
- Sửa dùng chung (lẫn với service khác, tách bằng `git add -p`): `web/src/registry.ts`, `web/src/shared/json.ts` (thêm `jsonObjectError`), `web/src/services/sns/filterPolicy.ts` (dùng lại `jsonObjectError`), `tests/ui/responsive.spec.ts`, `tests/it/leftovers.mjs`, `web/package.json`, `tests/package.json`, `package-lock.json`.
- Package đã cài hôm nay (user cho phép): `client-eventbridge`, `client-scheduler`, `client-sfn`, `client-secrets-manager`, `client-ssm` (web); 4 cái trừ `client-sfn` (tests).

### Lần chạy 2 — file thêm (cùng quy tắc tách stash)

- Mới: `eventbridge/pattern.ts`, `targets.ts`, `hooks/{useRules,useTargets}.ts`, `pages/{RuleList,RuleForm,RuleDetail}.tsx`, `components/{TestPatternSection,DeleteRulesModal,AddTargetModal,TargetsTab,RuleDetailsTab}.tsx`, `web/test/services/eventbridge/pattern.test.ts`, `tests/it/eventbridge-rules.test.ts`, `tests/e2e/eventbridge-rules.spec.ts`.
- Sửa: `routes.ts`, `constants.ts`, `schemas.ts`, `rules.ts`, `index.tsx`, `pages/BusList.tsx` (tên bus là link sang Rules), `tests/ui/responsive.spec.ts` (+2 trang), `tests/it/leftovers.mjs` (rule trên bus default).

### Lần chạy 3 — file thêm (bước 5)

- Mới: `eventbridge/scheduleExpression.ts`, `schedules.ts`, `hooks/{useScheduler,useSchedules}.ts`, `pages/{ScheduleList,ScheduleForm,ScheduleDetail}.tsx`, `components/{TargetResource,CreateGroupModal,DeleteGroupModal,DeleteSchedulesModal}.tsx`, `web/test/services/eventbridge/schedule.test.ts`, `tests/it/eventbridge-schedules.test.ts`, `tests/e2e/eventbridge-schedules.spec.ts`.
- Sửa: `routes.ts`, `constants.ts`, `schemas.ts` (`scheduleSchema`, `createGroupSchema`), `targets.ts` (thêm loại event bus, `SCHEDULE_TARGET_KINDS`), `components/TargetsTab.tsx` (tách `TargetResource`), `index.tsx`, `tests/ui/responsive.spec.ts` (+2 trang), `tests/it/leftovers.mjs` (schedule trên group default và group của test).

### Quyết định tự chốt (theo 4 tiêu chí)

| Quyết định | Lý do |
| ---------- | ----- |
| Bus `default` hiện trong bảng nhưng checkbox khóa (`isItemDisabled`) | Spec 3.1 ("không chọn được để xóa"); tiêu chí 1 |
| Xóa bus = gỡ target → xóa rule → xóa bus, dùng `rules.ts` (`deleteRule`, `listRuleNames`) | Spec 3.1/4; bước 3 dùng lại cho xóa rule, không viết hai lần |
| Modal xóa bus liệt kê số rule từng bus (`useRuleNames`) | Spec 3.1 ("liệt kê số rule sẽ mất") |
| `jsonObjectError` đưa vào `shared/json.ts`, `filterPolicyError` dùng lại | Cùng logic đã có ở SNS; tiêu chí dùng lại trước khi viết mới |
| `quickLinks` của Home chỉ có "Event buses" | Tạo bus là modal chứ không phải trang riêng, nên không có link "Create" |
| Tên bus trong bảng là link sang `rules?bus=` (bus default không ghi lên URL) | Spec 3.1; link ngắn gọn |
| State của rule dùng `FormCheckbox` "Enabled", không dùng Toggle | Repo chưa có `FormToggle`; không thêm component mới cho một ô; tiêu chí 1 |
| Tile "Schedule" bị khóa khi bus khác default, và schema chặn thêm một lớp | Luật AWS (spec 3.3); chặn ở form thay vì để Floci trả lỗi |
| Bus và Name của rule hiện chữ (không sửa) khi Edit | Spec 3.3 "Khóa khi sửa" |
| Test pattern: reset kết quả khi pattern hoặc event mẫu đổi | Tránh Match / No match cũ gây hiểu nhầm (bug UX tự tìm ra) |
| Sửa rule: `PutRule` giữ `RoleArn` đọc từ `DescribeRule` | Spec 3.3; IT xác nhận Floci giữ đúng |
| Ngày giờ của schedule `at` là một ô text `yyyy-mm-ddThh:mm:ss` (kèm ví dụ), không dùng DatePicker + TimeInput | Repo chưa có field date / time cho form; thêm 2 component để nhập một chuỗi là quá tay; tiêu chí 1 |
| Chưa làm Start / End date của schedule định kỳ | Dev ít dùng khi test; Start / End của schedule do IaC tạo vẫn được giữ nguyên khi sửa (gộp với `GetSchedule`) |
| Target Step Functions của schedule để bước 7 (cùng rule) | Chưa có trang Step Functions; chỉ hiện ARN text |
| Target `other` (ECS, Kinesis…) khóa khi sửa, hiện ARN và ghi chú | Spec 3.6 |
| Timezone chỉ gửi cho `at` và `cron`; `rate` giữ giá trị cũ khi sửa | Rate không dùng timezone; tránh ghi đè giá trị IaC |
| Ô chọn group có mục All groups; Create group / Delete group nằm cạnh; Delete group chỉ bật khi chọn group khác default | Spec 3.5 |
| Id target = `<loại>-<tên resource>` cắt 64 ký tự | Tự sinh, ổn định, đọc được; spec 3.4 chỉ nói "tự sinh" |
| Xóa rule: gỡ query của rule đã xóa, không invalidate | Tránh gọi `DescribeRule` rule vừa mất (400) khi trang chi tiết còn mở |

### Đã kiểm trên Floci 2.4.0 (khớp spec)

- `ListEventBuses` có bus `default`; `CreateEventBus` → ARN `…:event-bus/<tên>`.
- Rule `{"source": ["lc.it"]}` trên custom bus + target SQS: `PutEvents` giao event, body có `source`, `detail-type`, `detail` đúng.
- Xóa theo thứ tự `RemoveTargets` → `DeleteRule` → `DeleteEventBus` chạy được.
- UI: tạo bus (validation `default`, ký tự lạ), Send events (validation Detail type, thành công trả Event ID), xóa bus (modal gõ `delete`); 390px bảng thành 1 cột, nút gom vào dropdown, không cuộn ngang.

### Đã kiểm thêm ở lần chạy 2 (Floci 2.4.0)

- `TestEventPattern` với event bọc đủ trường: match theo `source`, theo `detail` lồng; `numeric` luôn No match (đúng spec 7 #8).
- Sửa rule bằng `PutRule` + `RoleArn` từ `DescribeRule`: `RoleArn` và mô tả được giữ / cập nhật đúng.
- Enable / disable rule, tạo rule `rate(5 minutes)` trên bus default đọc lại đúng.
- Bug tham chiếu treo: xóa queue đang là target của rule → tab Targets hiện "(not found)" (QueueLink); trình duyệt ghi 1 console.error 400/404 khi dò (đã nêu ở README).

### Đã kiểm thêm ở lần chạy 3 (Floci 2.4.0)

- Scheduler: `rate(1 hour)` chạy ngay khi tạo, `Input` về đúng queue (IT + E2E).
- Disable bằng `GetSchedule` + `UpdateSchedule`: `RoleArn` thật, `RetryPolicy`, mô tả được giữ.
- `at(...)` giữ timezone và `ActionAfterCompletion`; trùng tên → `ConflictException`; `rate(0 minutes)` → `ValidationException`; xóa group `default` bị từ chối.
- `ListSchedules` chỉ trả đích (`Target.Arn`), không có biểu thức; xóa group xóa luôn schedule trong đó.

### Test đã chạy (2026-11-20)

- `npm run typecheck` sạch; unit 186 + 12 pass.
- IT `eventbridge.test.ts` 5/5, `eventbridge-rules.test.ts` 7/7, `eventbridge-schedules.test.ts` 9/9.
- E2E `eventbridge.spec.ts`, `-rules`, `-schedules`: 9/9 (Docker console, build lại sau mỗi lần sửa code).
- UI responsive 5 trang EventBridge × 4 khung: 20/20. Unit 216.
- E2E trên Vite dev (5173) fail vì `favicon.ico` 404 (chỉ Vite dev, Docker trả 200). Chạy E2E/UI nên dùng Docker console (3701).

### Bug / ghi chú

- Đã sửa trong lúc làm: (1) trang tạo rule gọi `DescribeRule` với tên rỗng (400); (2) Event bus và Name sát nhau vì Fragment trong `SpaceBetween`; (3) xóa rule ở trang chi tiết gây 400 do invalidate rule vừa xóa; (4) kết quả Test pattern không reset khi sửa; (5) `leftovers.mjs` sót rule `lc-e2e-*` trên bus default.
- Ace tự đóng ngoặc nên E2E đặt giá trị editor qua `.ace_editor` → `env.editor.setValue` (gõ phím thừa `}`).
- Cảnh báo React "unique key" trên trang chi tiết rule: chưa tìm ra nguồn; cũng thấy ở trang khác trước đó, không riêng EventBridge.
- Lần chạy 3: (1) mô tả header chi tiết schedule lặp biểu thức → đổi thành One-time / Recurring; (2) ô Input ở chi tiết schedule thiếu nhãn → đưa vào KeyValuePairs; (3) E2E: nút Edit trong ActionBar có href nên role là link, không phải button.
- Vite dev trong WSL: chạy với `CHOKIDAR_USEPOLLING=1` thì thấy sửa file từ Windows, không phải restart.
- Cảnh báo `[AwsUi] [Button] Overriding native attribute [aria-haspopup]` khi khung hẹp: có sẵn từ `ActionBar`, không phải do EventBridge.

## Cần user duyệt

- (chưa có)

## Việc kế tiếp (lần chạy sau)

1. Bước 6: `useEventSources` (rule: `ListEventBuses` → `ListRules` → `ListTargetsByRule` lọc ARN; schedule: `ListSchedules` lọc `Target.Arn`) + khối EventBridge ở Lambda › Triggers (`DISPLAY_ONLY_SOURCES`, `SOURCE_LABELS`), SQS › Settings, SNS › Details. Cân nhắc cảnh báo ở modal xóa queue / function / topic khi còn rule hoặc schedule trỏ tới (`useReferencedNames` hiện chỉ quét S3 và SNS).
2. Bước 7: target Step Functions cho rule và schedule (ARN text; `@aws-sdk/client-sfn` đã cài).
3. Bước 8: test cuối, flow Lambda target + peek queue, schedule → event bus, StackLink khi CloudFormation vào dev.
4. Sau đó mới sang Secrets Manager + SSM.

## Secrets Manager + SSM

Chưa bắt đầu (làm sau khi EventBridge xong).

## Edge case đã kiểm và sửa (sau khi port, 2026-11-20)

- Ô chọn bus (Rules) và group (Schedules) trống khi giá trị trong URL không có trong danh sách → hiện tên đang xem.
- `?bus=` / `?group=` không tồn tại: Floci trả danh sách rỗng chứ không báo lỗi → trang báo "… not found", nút Create không mang theo giá trị đó, Delete group bị khóa. Test `e2e/eventbridge-edge.spec.ts`.
- Form tạo rule: chọn Schedule rồi đổi sang bus khác default → tự chuyển về Event pattern (trước đó tile khóa nhưng ô Schedule expression vẫn hiện).
- Đã kiểm, không có lỗi: tên rule có dấu chấm, mô tả có ký tự đặc biệt / HTML (hiện nguyên văn, không render), rule tắt, trang rule / schedule không tồn tại (cả trang sửa), cron sai (lỗi gốc của Floci hiện ở Flashbar), queue FIFO bắt message group ID, dark mode, 1024 và 390px không tràn ngang.
- Ghi nhận, chưa xử lý: Floci chấp nhận schedule `at()` ở quá khứ (tạo thành công); khi bật "Delete after completion" nó có thể biến mất ngay.
- Rà UI ở 390 / 768px (rule, schedule, danh sách, chi tiết, form sửa), sửa 2 bug thật: (1) trang chi tiết schedule vẫn chia 2 cột ở 390px vì `useIsCompact(ITEM_LIST_WIDTH_PX)` không gắn `ref` vào phần tử nào (luôn `false`); (2) form sửa schedule: ô Time zone trống khi schedule lưu tên không có trong `Intl.supportedValuesOf("timeZone")` (vd `Asia/Ho_Chi_Minh`, trình duyệt chỉ có `Asia/Saigon`) → luôn đưa giá trị đang có vào danh sách. Test hồi quy ở `eventbridge-edge.spec.ts`.

## Bước 6 — Liên kết Lambda / SQS / SNS (2026-11-20)

- `eventbridge/eventSources.ts` (`listEventSources`, `targetsArn`, `listRuleTargets`, `listScheduleTargets`) + `hooks/useEventSources.ts`. Rule: `ListEventBuses` → `ListRules` → `ListTargetsByRule` lọc ARN (Floci không có `ListRuleNamesByTarget`); schedule: `ListSchedules` lọc `Target.Arn`. Query nằm dưới key gốc EventBridge nên tạo / sửa / xóa rule hay schedule làm mới luôn khối này.
- `components/EventSources.tsx` (khối **EventBridge**, rỗng thì ẩn): thêm vào **SQS › Settings** và **SNS › Details**.
- **Lambda › Triggers**: thêm nguồn `eventbridge` (rule, kèm bus) và `scheduler` (schedule, kèm group) vào `DISPLAY_ONLY_SOURCES`; hàng có link sang trang rule / schedule, **không chọn được** (`isItemDisabled`, `EVENTBRIDGE_SOURCES`) vì bật / tắt / xóa làm ở trang EventBridge. ARN function có version / alias vẫn khớp.
- **Cảnh báo khi xóa** (đề xuất của tôi theo tiêu chí nối giữa các service, chưa có trong spec 3.9): `useReferencedNames` quét thêm đích của rule và schedule, nên modal xóa queue / function / topic nói "SNS subscriptions, S3 notifications, EventBridge rules or schedules still point at …".
- File: mới `eventSources.ts`, `hooks/useEventSources.ts`, `components/EventSources.tsx`, `web/test/services/eventbridge/eventSources.test.ts`, `tests/it/eventbridge-links.test.ts`, `tests/e2e/eventbridge-links.spec.ts`; sửa `lambda/constants.ts`, `lambda/hooks/useTriggers.ts`, `lambda/components/TriggersTab.tsx`, `sqs/components/SettingsTab.tsx`, `sns/components/DetailsTab.tsx`, `s3/hooks/useReferencedNames.ts`, `shared/components/ReferencedWarning.tsx`.
- Test: unit 245; IT `eventbridge-links` 2/2 (rule → Lambda chạy thật, log có event); E2E EventBridge 18/18 (SQS Settings, queue không có rule thì ẩn khối, SNS Details, Lambda Triggers chỉ xem + link, cảnh báo xóa queue); responsive toàn app 84/84.
- Ghi nhận: quét rule chạy N+1 lệnh (bus × rule), chấp nhận được ở local; nếu chậm khi có hàng trăm rule thì cần cache hoặc giới hạn.

## Việc kế tiếp
1. Bước 7: target Step Functions cho rule và schedule (ARN dạng text).
2. Bước 8: test cuối, schedule → event bus, StackLink khi CloudFormation vào dev.
3. Spec `2026-11-20-integration-enhancements-design.md` (Lambda destination, SES configuration set) cần EventBridge xong: dùng `useBuses` và link bus.

## Test flow kết hợp nhiều service (2026-11-20)

**IT `tests/it/eventbridge-flows.test.ts` (7/7, chạy trên Floci thật):**
- S3 → EventBridge → SQS: bật `EventBridgeConfiguration` cho bucket, upload → queue nhận `aws.s3` / `Object Created` có đúng bucket và key.
- EventBridge → SNS → SQS: rule trỏ topic, queue subscribe (raw) nhận event.
- Một event, ba đích (queue, topic → queue, Lambda): cả ba nhận từ một `PutEvents`.
- Scheduler → Lambda: `rate(1 hour)` chạy ngay, Input vào đúng function.
- Scheduler → event bus → rule (bus tuỳ chỉnh) → queue: chuỗi chạy được (event tới sau ~10 giây, lần đầu Floci quét lịch).
- Rule → queue FIFO với `MessageGroupId` đặt ở target: message có đúng group.
- Đích đã bị xóa: rule và target còn nguyên, `PutEvents` vẫn thành công (Floci chỉ bỏ event).

**E2E `tests/e2e/eventbridge-flow.spec.ts` (6/6, qua UI của 4 service):** SQS tạo queue → S3 bật EventBridge → EventBridge tạo rule + target queue → upload → SQS peek thấy event S3 → Settings của queue liệt kê rule → xóa queue (modal cảnh báo rule) → rule báo "(not found)".

**Phát hiện và sửa:**
- Thiếu sót: spec 3.9 yêu cầu S3 › Event notifications có công tắc **Amazon EventBridge On / Off** nhưng code chỉ *giữ nguyên* cấu hình có sẵn, nên chỉ dùng UI thì không bật được S3 → EventBridge. Đã thêm `Toggle` ở `NotificationsSection` (kèm link "Create a rule…"); `toNotificationConfiguration(rules, current, eventBridge?)` bật / tắt mà không mất rule; unit test thêm.
- E2E: tham chiếu treo làm trình duyệt ghi 1 `console.error` 400/404 → thêm tuỳ chọn `danglingProbes` (mặc định tắt) vào `e2e/fixtures.ts`, chỉ bật trong `test.describe` của test xóa queue; chỉ bỏ qua lỗi 400/404 tới `/aws/`.
- Toggle của Cloudscape đổi theo dữ liệu đã lưu nên E2E dùng `click()`, không dùng `check()`.

**Kết quả cả repo sau khi gộp bước 6 và flow:** typecheck sạch; unit 246; IT 15 file / 78 test; E2E 61/61; responsive 84/84.

## Edge case của tổ hợp EventBridge × service khác (2026-11-21)

Đã kiểm trên UI thật, không có bug mới:
- Đích Lambda có **alias** (`…:function:fn:prod`): Lambda › Triggers vẫn hiện rule (khớp theo tiền tố); trang rule hiện tên function (không hiện `prod`).
- Xóa **function / topic** còn rule và schedule trỏ tới: modal cảnh báo đúng tên. Sau khi xóa, rule hiện "(not found)" cho cả hai đích; schedule hiện "(not found)" ở trang chi tiết và danh sách; gỡ target treo bằng nút Remove chạy được.
- **120 rule trên 6 bus** cùng trỏ vào một queue: khối EventBridge ở SQS Settings và cảnh báo trong modal xóa hiện sau ~0,5–0,8 giây (132 lệnh). N+1 chưa là vấn đề ở quy mô local.
- Ghi nhận nhỏ, chưa xử lý: khối EventBridge ở SQS / SNS không phân trang (120 dòng là 120 hàng); alias bị ẩn ở cột Resource của rule; tắt công tắc EventBridge của S3 khi còn rule bắt `aws.s3` thì rule im lặng ngừng nhận event (không có cảnh báo).

## Đã sửa 3 ghi nhận + edge case (2026-11-21)

- **Phân trang khối EventBridge** (SQS Settings, SNS Details): `useCollection`, 10 dòng một trang, chỉ hiện `Pagination` khi có hơn một trang.
- **Alias ở cột Resource**: `qualifierOfArn`; rule trỏ `…:fn:prod` hiện `fn:prod` (vẫn là link tới function).
- **Tắt công tắc EventBridge của S3 khi còn rule bắt event của bucket**: modal xác nhận liệt kê rule (`matchesS3Bucket`: source `aws.s3`, không lọc bucket hoặc lọc đúng tên bucket; toán tử như `prefix` coi là có thể khớp). Hook `useS3EventRules(bucket, enabled)` chỉ quét khi công tắc đang bật.
- **Schedule `at()` ở quá khứ**: đã kiểm Floci chạy ngay (queue nhận message) và xóa luôn nếu bật Delete after completion, còn nếu giữ lại thì nằm đó ở trạng thái bật nhưng không chạy nữa. Không chặn (dev có thể muốn chạy ngay); form hiện gợi ý `Alert` khi giờ đã qua, so theo timezone của schedule (`isPastAtTime`, không dùng timezone của trình duyệt).
- Lỡ chạy `prettier --write web/src/services` làm định dạng lại 12 file của service khác; đã khôi phục từ HEAD (`git show`), không để diff thừa. Lần sau chỉ format đúng file mình sửa.
- Test thêm: unit (`matchesS3Bucket`, `qualifierOfArn`, `isPastAtTime`), E2E (alias, phân trang, modal tắt S3, gợi ý quá khứ). Toàn repo: unit 256, IT 78, E2E 65/65, responsive 84/84.

## Rà thêm edge case qua UI (2026-11-21)

Đã kiểm, không có lỗi: sửa rule đang tắt (giữ Disabled, mô tả mới, `RoleArn` giữ nguyên); sửa schedule đang tắt đổi đích SQS → Lambda (Input không phải JSON bị chặn, lưu xong vẫn Disabled, mô tả và `RoleArn` giữ, `SqsParameters` bỏ); tạo schedule với đích SNS và event bus (thiếu Source / Detail type bị chặn); bật / tắt 2 rule cùng lúc; xóa bus có 2 rule (modal báo "(2 rules)", xóa cả rule); xóa group có 2 schedule (modal báo, schedule mất theo).

**Bug tìm ra và đã sửa:** schedule trỏ tới event bus. Bus bị xóa mà đích vẫn hiện ARN thô (không link, không "(not found)") và modal xóa bus không cảnh báo, khác với queue / topic / function. Sửa: \`BusLink\` (link sang rule của bus, "(not found)" khi bus không còn trong danh sách), \`busNameOfArn\`, và \`DeleteBusesModal\` dùng \`useReferencedNames\` như các modal xóa khác. Test: unit \`busNameOfArn\`, E2E \`eventbridge-edge.spec.ts\`.

Chưa kiểm được: Floci tắt giữa chừng (lệnh dừng container bị chặn). Cơ chế "Floci unreachable" là của cả console, không riêng EventBridge.

## Rút gọn sau review (2026-11-21)

- Bỏ `isPastAtTime` (tính chênh lệch múi giờ bằng `Intl`) cùng `Alert`, 2 `useWatch` và 4 test: gợi ý "giờ đã qua thì Floci chạy ngay" thành một câu tĩnh nối vào mô tả ô Date and time của form schedule.
- `matchesS3Bucket` còn 3 dòng so chuỗi JSON có trích dẫn (bỏ parse và ép kiểu). **Đánh đổi:** không nhận ra toán tử trong bộ lọc bucket (`{"prefix": …}`), nên rule dạng đó không được liệt kê trong modal tắt EventBridge của S3.
- Modal tắt EventBridge của S3: bỏ `Alert` lặp ý, câu "N rules match events…" thành dòng đầu của modal.

## Bước 7 hoãn (2026-11-21)

User chốt: chưa làm target Step Functions vì console chưa có service Step Functions (không tạo được state machine, chỉ dán ARN thì không kiểm chứng được gì). Làm cùng lúc với service Step Functions. Hiện hàng target Step Functions do IaC tạo vẫn hiện đúng loại. EventBridge coi như xong phần còn lại; việc kế tiếp là Secrets Manager + SSM.
