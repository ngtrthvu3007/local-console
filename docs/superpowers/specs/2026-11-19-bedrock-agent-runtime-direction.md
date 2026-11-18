# Local Console — Bedrock Agent Runtime: định hướng

> Ngày: 2026-11-19  
> Trạng thái: bản định hướng, chưa phải implementation spec

## 1. Bối cảnh

Local Console là cửa sổ để dev làm việc với AWS local. Hiện runtime local là Floci: ứng dụng vẫn dùng AWS SDK, nhưng S3, SQS, DynamoDB, Lambda, SES và các resource khác chạy local thay vì gọi AWS thật.

Amazon Bedrock là nhu cầu tiếp theo. Team không nên đợi đến production mới biết prompt, tool loop, context hay integration với AWS resource của agent bị lỗi. Một lỗi ở production có thể gây tốn kém và khó chẩn đoán hơn nhiều so với việc dùng năng lực AI có kiểm soát khi develop local.

Mục tiêu không phải dựng một model yếu ở máy dev để thay thế Claude, GPT, Gemini hay Grok. Mục tiêu là để user dùng chính agent/model chất lượng cao mà họ đã đăng nhập và chọn, trong khi toàn bộ AWS substrate của app vẫn ở local.

## 2. Vấn đề cần giải quyết

Một app agentic thường có hai phần:

1. **AWS substrate**: queue, object, database, Lambda, email, event và log.
2. **AI runtime**: model/agent nhận context, quyết định, gọi tool và trả kết quả.

Local Console đã giải quyết phần thứ nhất qua Floci. Bedrock Agent Runtime phải nối phần thứ hai vào môi trường local, để app test được end-to-end mà không tạo resource production.

## 3. Định hướng sản phẩm

Thêm một service **Bedrock** trong Local Console, với một **Agent Bridge** chạy local.

```text
App local
  -> Bedrock Runtime API
  -> Floci
  -> Local Console Agent Bridge
  -> Claude Code / Codex / Gemini CLI / Grok Build / custom agent
```

App vẫn gọi Bedrock API. Floci vẫn giả lập AWS endpoint. Agent Bridge nhận request runtime rồi gọi agent user đã chọn trên chính máy đó; response và tool-call result được đổi về Bedrock-compatible shape.

User tự quyết định agent, subscription, permission và môi trường chạy. Local Console không thay agent bằng model local bắt buộc, không quản lý billing và không tự fallback sang một model khác.

## 4. Vì sao cần Agent Bridge

Floci có Bedrock Runtime API (`Converse`, `ConverseStream`, `InvokeModel`) và proxy được `Converse`/`ConverseStream` sang OpenAI-compatible endpoint. Nó không gọi trực tiếp native Anthropic, Gemini, xAI hay coding-agent CLI.

Agent Bridge là endpoint OpenAI-compatible mà Floci gọi tới. Bên trong bridge có connector riêng cho từng runner:

| Runner | Cách gọi headless |
| --- | --- |
| Claude Code | `claude -p` |
| Codex | `codex exec` |
| Gemini CLI | `gemini -p` |
| Grok Build | `grok -p` |
| Custom | command hoặc local adapter do user cung cấp |

Các connector không nên bị coi là giống nhau. Chúng khác session model, output format, streaming, tool permission, workspace và cách trả lỗi. Bridge chuẩn hóa những khác biệt đó thành contract mà Bedrock Runtime hiểu được.

## 5. Agent profile

User tạo một **Agent Profile** trong trang Bedrock. Profile không chứa raw credential; nó tham chiếu tới CLI/session user đã login hoặc local command/adapter user tự quản lý.

Một profile cần có:

- Tên và runner: Claude Code, Codex, Gemini CLI, Grok Build hoặc Custom.
- Model được runner dùng.
- Working directory/context fixture.
- Session policy: fresh session hoặc resume session.
- Tool policy và sandbox/permission policy.
- Chế độ chạy.

Hai chế độ chạy:

### Model-compatible mode

Bridge nhận `system`, `messages`, inference config và tool schema từ Bedrock request. Nó yêu cầu runner trả text hoặc tool call có cấu trúc; app vẫn là bên thực thi tool và gửi `toolResult` ở turn tiếp theo.

Đây là mode gần nhất với logic dùng Bedrock Runtime của app.

### Agent mode

Bridge giao cả task cho agent trong workspace và với tool permission của profile. Agent có thể đọc file, gọi command hoặc dùng tool đã được cho phép rồi trả final result.

Mode này test hành vi agent hoàn chỉnh, nhưng không còn tương đương hoàn toàn với một raw Bedrock `Converse` request.

## 6. Model selection và routing

`modelId` là giá trị app gửi khi gọi Bedrock, ví dụ `anthropic.claude-sonnet-4-5-20250929-v1:0`.

Trong local, bridge có hai hướng:

1. **V1: active profile** — mọi Bedrock request đi vào profile user đang chọn. Đây là cách đơn giản để test logic local.
2. **Sau đó: route theo `modelId`** — mỗi `modelId` map tới một Agent Profile. App có thể test multi-model routing mà không đổi code khi chuyển sang production.

Không được tự động đổi model khi profile lỗi. Lỗi cấu hình hoặc runner phải hiện rõ để dev biết local test không còn fidelity.

## 7. Production fidelity và context isolation

Rủi ro lớn không chỉ là model khác nhau. Coding agent thường mang history, user-level config, workspace rules, context từ repo hiện tại và tool permission khác production. Nếu dùng nguyên session hàng ngày của dev, kết quả dễ lệch production.

Vì vậy Local Console cần **Production Fidelity Profile**, không phải chỉ một dropdown model:

- Luôn có tùy chọn fresh session, không resume history.
- Dùng working directory/fixture riêng thay vì repo dev mặc định.
- Version hóa system prompt, model/version, inference config, tool schema và context/RAG fixture của app.
- Khóa tool permission theo cấu hình production cần mô phỏng.
- Lưu trace: request, response, tool call, thời gian và lỗi. Nội dung nhạy cảm phải do user kiểm soát việc hiển thị/lưu.

Ví dụ:

```text
Profile: Order Agent - production clone
Runner: Claude Code
Session: fresh
Workspace: .local-console/agent-fixtures/order-agent/
Tools: chỉ tool production
Prompt + tool schema + RAG fixture: versioned cùng app
```

## 8. Fine-tuning

Fine-tuning là train lại trọng số model. Bedrock thật hỗ trợ model customization cho một số model/region; training job dùng dataset, S3 và IAM role, có thể chạy nhiều giờ.

Fine-tuning **không** giải quyết context contamination của coding-agent CLI. Nó cũng không thể được tái tạo local chỉ bằng việc gọi Claude Code, Codex, Gemini CLI hay Grok Build.

Floci hiện không emulation custom model, model customization, import, distillation hay fine-tuning job. Vì vậy:

- Local Console dùng Agent Profile + context fixture để mô phỏng runtime context.
- Nếu production dùng custom/fine-tuned Bedrock model, cần một acceptance suite riêng gọi model thật trong AWS sandbox.
- Local Console vẫn test được AWS integration flow, request shape, tool loop, failure handling và context fixture trước khi chạy suite AWS thật.

## 9. Phạm vi v1

1. Bedrock Runtime screen: health, active profile, invocation trace và lỗi runner.
2. Agent Bridge chạy local, expose endpoint tương thích với proxy Bedrock của Floci.
3. Connector đầu tiên: Claude Code.
4. Model-compatible mode với fresh session và structured output.
5. Context fixture/working directory tường minh.
6. App chỉ cần trỏ endpoint AWS sang local; không đổi call site Bedrock.

Codex, Gemini CLI, Grok Build và Custom connector là các profile tiếp theo dùng cùng bridge contract.

## 10. Ngoài phạm vi v1

- Host hoặc train LLM local.
- Fine-tune trọng số model ở local.
- Giả vờ tất cả Bedrock operation đều được Floci hỗ trợ.
- Fallback im lặng sang model khác.
- Lưu API key/provider credential trong Local Console UI.

## 11. Quyết định cần chốt trước khi implementation

1. V1 chỉ có một active Agent Profile hay đã route theo `modelId`?
2. Structured tool-call contract cho Claude Code connector là gì?
3. Invocation trace được giữ trong memory, file local hay chỉ stream ra UI?
4. Cách import/version hóa production context fixture cùng source app.
5. Ranh giới quyền: Model-compatible mode có cấm hoàn toàn filesystem/shell tool hay cho profile tự khai báo?

## 12. Tài liệu tham khảo

- [Floci Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/)
- [Floci Bedrock control-plane limitations](https://floci.io/floci/services/bedrock/)
- [Amazon Bedrock fine-tuning](https://docs.aws.amazon.com/bedrock/latest/userguide/custom-model-fine-tuning.html)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)
- [Gemini CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md)
- [Grok Build](https://docs.x.ai/build/overview)
