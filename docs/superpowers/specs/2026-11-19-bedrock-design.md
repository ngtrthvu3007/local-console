# Bedrock Runtime — Thiết kế

> Ngày: 2026-11-19 · Trạng thái: chờ duyệt · Thuộc: [Local Console](2026-11-09-localconsole-design.md)
>
> Thay cho bản định hướng `2026-11-19-bedrock-agent-runtime-direction.md` (hướng Agent Bridge, đã bỏ: mục 9).
> Đổi so với [roadmap](../roadmap.md) mục 5: Bedrock từ "Không làm" thành làm, vì Bedrock Runtime của Floci có chế độ proxy trả câu trả lời thật (mục 4).

## 1. Mục tiêu

App gọi Bedrock (`Converse`, `ConverseStream`) chạy local với **câu trả lời thật của LLM**, không tạo resource trên AWS. Dev local dùng để:

- Test luồng của app: request gửi đi, tool call, xử lý lỗi, stream.
- Tạo nhiều **model profile** (model local như Ollama, LiteLLM, hoặc provider ngoài như OpenAI, Claude, Gemini bằng API key của chính mình). Mỗi profile nhận một số `modelId`, nên app dùng nhiều model cùng lúc như trên Bedrock thật.
- Gửi thử một câu hỏi trên console mà không cần chạy app.

App chỉ trỏ `AWS_ENDPOINT_URL` sang Floci như các service khác. **Code gọi Bedrock không đổi**, với điều kiện app gọi `Converse` / `ConverseStream`. App gọi `InvokeModel` (vd: Anthropic Bedrock SDK, LangChain `ChatBedrock`) nhận lỗi, không dùng được (mục 7).

Không nhằm đánh giá chất lượng câu trả lời so với production: model local hoặc model của provider khác không giống model Bedrock thật.

### Đối chiếu với Bedrock thật

| Bedrock thật                                                                 | Local Console                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Model serverless, không có trạng thái chạy / dừng                            | Profile không có start / stop                                         |
| Cấp quyền dùng model một lần (model access), sau đó app chọn model theo `modelId` trong từng request | Profile nhận một số `modelId`; request đi vào profile theo `modelId` |
| Dùng nhiều model cùng lúc                                                    | Nhiều profile cùng bật                                                |
| Gọi model chưa được cấp quyền / không tồn tại → lỗi                          | `modelId` không profile nào nhận → lỗi                                |

---

## 2. Phạm vi

### Làm trong đợt này

| Nhóm       | Tính năng                                                                                                                      | Lý do giữ                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Profile    | Tạo, sửa, **Enable / Disable**, **Delete**. Hai loại: **Local endpoint** (URL, key tùy chọn), **External provider** (URL + API key) | Dùng nhiều model cùng lúc, tạm ngưng không mất cấu hình |
| Model      | Mỗi profile có bảng `modelId` của Bedrock → tên model của nguồn                                                               | App gửi `modelId` Bedrock, nguồn cần tên riêng   |
| Token      | Nhập API key trên UI; chỉ giữ trong RAM; hiện dạng che (`sk-…abcd`); nút **Clear key** từng profile                           | User dùng key của mình, không lưu xuống đĩa      |
| Placeholder | Chưa có profile nào: màn hình trống kèm hướng dẫn và nút tạo profile                                                         | User biết app đang nhận stub và cần làm gì       |
| Playground | Gửi một câu hỏi qua `Converse` (đi đúng đường app đi), xem câu trả lời, token usage, thời gian, lỗi                           | Kiểm tra profile mà không cần chạy app           |
| Connect    | Biến môi trường để trỏ app về Floci; code mẫu `Converse` với `modelId` của profile đang bật; operation nào trả kết quả thật / stub | Dev copy về là gọi đúng operation, đúng `modelId` |

### Làm sau

| Tính năng                                   | Ghi chú                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Banner `modelId` không khớp profile         | Server nhớ các `modelId` app gọi mà không profile nào nhận, UI hiện kèm nút thêm vào profile. Bản đầu app đã nhận lỗi (mục 5) |
| `ConverseStream` trong Playground           | V1 gửi `Converse`. App vẫn dùng được `ConverseStream` (Floci proxy được)                 |
| Lịch sử request của app (trace)             | Server đã đứng giữa nên ghi được; cần chốt chỗ lưu và việc che nội dung                  |

### Không làm

| Tính năng                                                                    | Lý do                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `InvokeModel`                                                                | Ở chế độ proxy, Floci trả 400 `ValidationException` (đã kiểm, mục 7) |
| `InvokeModelWithResponseStream`                                              | Floci trả 501                                        |
| Agents, Knowledge Bases, Guardrails, model customization (fine-tune, import), Provisioned Throughput | Floci không giả lập          |
| Bridge subscription viết trong console                                       | Đã có bridge cộng đồng; user tự chạy trên host rồi thêm làm Local endpoint (mục 9) |
| Claude bằng subscription (Pro / Max)                                         | Điều khoản Anthropic không cho (mục 7.5, 9)          |
| Lưu token xuống đĩa, `localStorage`                                          | Token chỉ sống trong RAM của server                  |

---

## 3. Màn hình

Theo quy tắc chung của các service đã làm: chỉ dùng component và token của Cloudscape; mỗi vùng một nút chính; thiếu giá trị là "—".

### 3.1 Trang Bedrock — `/bedrock`

```text
Bedrock Runtime
[Model profiles] [Playground] [Connect]
```

Tab lưu trên URL (`?tab=`). Mặc định mở **Model profiles**.

### 3.2 Tab Model profiles

**Placeholder** — khi chưa có profile nào:

```text
Model profiles

                     No model profiles yet
     Your app gets a stub reply from Converse and ConverseStream.
   Add a local endpoint (Ollama, LiteLLM) or an external provider
                  with your API key to get real answers.

                        [Create profile]
```

- Dùng khối empty state của Cloudscape, giống bảng rỗng ở các service khác.
- Tab Playground và Connect vẫn dùng được; Playground lúc này nhận câu stub.

**Danh sách** — khi đã có profile:

```text
Model profiles (2)                         [↻] [Disable] [Delete] [Create profile]
 ☐ Name        Type               Model IDs   API key       Status
 ☐ openai      External provider          2   sk-…abcd      Enabled
 ☐ ollama      Local endpoint             1   —             Enabled
 ☐ openai-2    External provider          1   Needs API key Enabled
```

- **Status**: Enabled / Disabled. Profile cần key mà chưa có key (sau restart, sau Clear key) hiện thêm "Needs API key".
- **Disable**: profile ngưng nhận request, giữ nguyên cấu hình và key. Request tới `modelId` của nó nhận lỗi (mục 5).
- **Delete**: modal xác nhận, xóa profile cùng key.
- Bấm tên để mở form sửa.

### 3.3 Tạo / sửa profile — `/bedrock/profiles/create`, `/bedrock/profiles/:name`

```text
Name           [openai                                     ]
Type           (•) External provider   ( ) Local endpoint
Provider       [OpenAI ▾]   (OpenAI / Claude / Gemini / Other)
Endpoint URL   [https://api.openai.com/v1                  ]
API key        [••••••••••••••••••••]   Saved: sk-…abcd   [Clear key]
               Kept in memory only. Cleared when the console restarts.

Model IDs      Bedrock modelId                              → Model
               anthropic.claude-sonnet-4-5-20250929-v1:0    → gpt-…      [Remove]
               amazon.nova-pro-v1:0                         → gpt-…      [Remove]
               [Add model ID]
                                                          [Cancel] [Save]
```

- **External provider**: URL và API key bắt buộc khi tạo. Chọn Provider thì điền sẵn URL, vẫn sửa được; "Other" để trống cho endpoint OpenAI-compatible khác:

  | Provider | URL                                                         | Ghi chú                                                   |
  | -------- | ----------------------------------------------------------- | --------------------------------------------------------- |
  | OpenAI   | `https://api.openai.com/v1`                                 |                                                           |
  | Claude   | `https://api.anthropic.com/v1`                              | Endpoint OpenAI-compatible của Anthropic, key Claude Console; giới hạn ở mục 7.4 |
  | Gemini   | `https://generativelanguage.googleapis.com/v1beta/openai`   | Google ghi đang beta                                      |

  Grok không có sẵn: tài liệu xAI khuyên dùng Responses API, chưa rõ `/chat/completions` còn được hỗ trợ không. Vẫn nhập tay được qua "Other".
- **Local endpoint**: URL bắt buộc (gợi ý `http://host.docker.internal:11434/v1` cho Ollama trên máy), API key tùy chọn (vd: master key của LiteLLM).
  - Cũng là chỗ dùng **ChatGPT bằng subscription**: user chạy trên host một bridge OpenAI-compatible bọc Codex CLI (vd: CLIProxyAPI), rồi nhập URL `http://host.docker.internal:<port>/v1`. Console không làm gì thêm.
  - Dưới ô URL có dòng: "Running a subscription bridge on your host? Use its URL here. Expect a few seconds per request and emulated tool calls. Claude subscriptions aren't allowed this way — use a Claude API key."
- API key là ô `password`. Khi sửa, ô để trống nghĩa là giữ key cũ. Server chỉ trả về dạng che.
- **Clear key**: xóa key khỏi RAM, profile còn nguyên và hiện "Needs API key".
- **Model IDs**: ít nhất một dòng. Một `modelId` chỉ thuộc một profile; trùng với profile khác thì báo lỗi khi Save. So khớp đúng từng ký tự (Floci gửi nguyên chuỗi app gọi, mục 7.1 #2), nên dưới ô có gợi ý: "Use the exact ID your app sends — inference profile (`global.…`, `us.…`) or ARN included."

### 3.4 Tab Playground

```text
Model ID   [anthropic.claude-sonnet-4-5-20250929-v1:0     ]
System     [                                             ]
Message    [Xin chào                                     ]
                                                         [Send]
Response   Xin chào! Tôi có thể giúp gì?
           Profile: openai · Model: gpt-… · Input 12 · Output 9 tokens · 1.2 s
```

- Gọi `Converse` bằng `@aws-sdk/client-bedrock-runtime` qua proxy `/aws`, tức là đi đúng đường của app: console → Floci → server console → nguồn model.
- Ô Model ID gợi ý các `modelId` của profile đang bật.
- Lỗi hiện đúng thông báo SDK nhận được, để dev thấy app sẽ gặp lỗi gì.

### 3.5 Tab Connect

Code mẫu giống nhau với mọi loại profile: app luôn gọi Floci, còn URL và key của nguồn chỉ cấu hình trên console.

```text
Environment        [On host] [In Docker]
  AWS_ENDPOINT_URL=http://localhost:4566
  AWS_ACCESS_KEY_ID=…
  AWS_SECRET_ACCESS_KEY=…
  AWS_REGION=…                                                   [Copy]

Example            Model ID [anthropic.claude-sonnet-4-5-20250929-v1:0 ▾]
  const client = new BedrockRuntimeClient({});
  await client.send(new ConverseCommand({
    modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
    messages: [{ role: "user", content: [{ text: "Hello" }] }],
  }));                                                           [Copy]
  Use Converse or ConverseStream. InvokeModel is not supported.

Operations
  Converse, ConverseStream         Real answer
  InvokeModel                      Not supported (400)
  InvokeModelWithResponseStream    Not supported (501)
```

- **Environment**: dùng lại `environmentFor()` của [ConnectYourApp](../../../web/src/pages/home/ConnectYourApp.tsx) trên trang Home; tab "On host" (`localhost:4566`) và "In Docker" (`floci:4566`).
- **Example**: AWS SDK JS v3, hiện bằng `CodeSnippet`. Dropdown Model ID lấy các `modelId` của profile đang bật; đổi thì code đổi theo. Chưa có profile nào: dropdown trống, code dùng một `modelId` mẫu, kèm dòng "No model profiles yet — this call gets a stub reply."
- Chỉ một ngôn ngữ (JS). Python, Go… thêm khi có người cần.
- **Not forwarded**: danh sách ngắn các trường Converse bị bỏ khi qua proxy (`document`, `cachePoint`, `reasoningContent`, `additionalModelRequestFields`, `guardrailConfig`; mục 7.2), để dev biết chỗ nào kết quả khác production.

---

## 4. Cách hoạt động

### 4.1 Đường đi của một request

```text
App (AWS SDK)
  POST localhost:4566/model/{modelId}/converse
→ Floci (Bedrock Runtime, BACKEND=proxy)
  POST console:3701/llm-proxy/chat/completions   (format OpenAI, Bearer = secret chung)
→ Server console
  kiểm secret → tìm profile theo modelId → đổi model → gắn API key của profile
→ Nguồn model của profile (OpenAI, LiteLLM, Ollama…)
```

Câu trả lời đi ngược lại; Floci đổi về format Bedrock rồi trả cho SDK.

- Floci và console là hai service trong cùng compose: Floci gọi console bằng tên service, không mở thêm port.
- Floci **cấu hình một lần** trong compose, luôn trỏ về console. Tạo, sửa, bật, tắt profile đều làm trên UI, không restart Floci.
- Ollama chạy trên máy: server console gọi được qua `host.docker.internal` (service `console` đã có `extra_hosts`).

### 4.2 Server chọn profile

| Tình huống                                        | Kết quả                                  |
| ------------------------------------------------- | ---------------------------------------- |
| Chưa có profile nào                               | Câu stub cố định (giữ hành vi như Floci stub) |
| `modelId` thuộc profile đang bật, có key (nếu cần) | Gọi nguồn của profile                   |
| `modelId` thuộc profile đang tắt                   | Lỗi (mục 5)                              |
| `modelId` thuộc profile thiếu key                  | Lỗi (mục 5)                              |
| `modelId` không thuộc profile nào                  | Lỗi (mục 5)                              |

### 4.3 Cấu hình Floci (compose)

| Biến                                               | Giá trị                                            |
| -------------------------------------------------- | -------------------------------------------------- |
| `FLOCI_SERVICES_BEDROCK_RUNTIME_BACKEND`           | `proxy`                                            |
| `FLOCI_SERVICES_BEDROCK_RUNTIME_PROXY_URL`         | `http://console:3701/llm-proxy` (base URL; Floci tự nối `/chat/completions`) |
| `FLOCI_SERVICES_BEDROCK_RUNTIME_PROXY_API_KEY`     | Secret chung: giá trị cố định viết sẵn trong compose, trùng với `LLM_PROXY_KEY` của `console`. User không đặt, không thấy |
| `FLOCI_SERVICES_BEDROCK_RUNTIME_PROXY_PASSTHROUGH` | `true`: chuyển nguyên `modelId`, console tự chọn profile |

Timeout không đặt được bằng biến môi trường (mục 7.1 #6), nên `command` của `floci` ghi lại lệnh mặc định của image và thêm một system property. 300 s để model local lớn trả lời kịp:

```yaml
command: ["/app/application", "-Dquarkus.http.host=0.0.0.0",
          "-Dfloci.security.allow-unsafe-network-exposure=true",
          "-Dfloci.services.bedrock-runtime.proxy.request-timeout-seconds=300"]
```

Hai tham số đầu là `CMD` của image `floci/floci:2.4.0`; lên version Floci thì đối chiếu lại.

### 4.4 Server console

| Route                                  | Đứng trước / sau `localOnly`                                    | Làm gì                                                                                       |
| -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/llm-proxy/*`                         | **Trước** (Floci gọi bằng Host `console`, như `/api/health`)    | Từ chối request có `Origin` hoặc `Sec-Fetch-Site` (từ trình duyệt); kiểm Bearer = secret chung; chọn profile theo `modelId` (mục 4.2); đổi `model`; thêm `strict: true` vào `response_format.json_schema` nếu có (Floci không gửi, Claude bắt buộc; mục 7.4); thay `Authorization` bằng key của profile; chuyển tiếp |
| `GET /api/bedrock/profiles`            | Sau                                                             | Danh sách profile, key dạng che, trạng thái                                                  |
| `POST /api/bedrock/profiles`           | Sau                                                             | Tạo profile                                                                                  |
| `PUT /api/bedrock/profiles/:name`      | Sau                                                             | Sửa profile, Enable / Disable                                                                |
| `DELETE /api/bedrock/profiles/:name`   | Sau                                                             | Xóa profile cùng key                                                                         |
| `DELETE /api/bedrock/profiles/:name/key` | Sau                                                           | Clear key                                                                                    |

- Không log header hay body của request đi qua `/llm-proxy`.
- Stream (`ConverseStream`): body trả về chuyển thẳng, không gom lại, để chữ tới app dần dần.

### 4.5 Lưu trữ

| Dữ liệu                                             | Lưu ở                              | Khi console restart                       |
| --------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| Profile: tên, loại, URL, bảng `modelId`, trạng thái | File JSON trong volume của console | Còn nguyên                                |
| API key                                             | RAM của server                     | Mất; profile cần key hiện "Needs API key" |

| Hành động  | API key                        |
| ---------- | ------------------------------ |
| Disable    | Giữ                            |
| Clear key  | Xóa, profile còn               |
| Delete     | Xóa cùng profile               |
| Restart    | Mất hết key, profile còn       |

- Profile Local endpoint không có key (Ollama, LiteLLM không đặt master key) chạy ngay sau restart.
- `docker compose down -v` xóa luôn profile, giống dữ liệu Floci.

---

## 5. Lỗi

Lỗi do server console trả cho Floci; Floci đổi sang lỗi Bedrock rồi trả cho app. UI không nằm trên đường đi của request.

Floci đổi **mọi** status lỗi của console (400, 429, 502…) thành `424 ModelErrorException`, message `Proxy backend returned HTTP {status}: {body}` (đã kiểm, mục 7). Nên server đặt message rõ trong body (`{"error":{"message":"…"}}`), status chỉ để đọc log.

| Tình huống                                       | Server console trả                                   | App nhận                                   |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------ |
| Request từ trình duyệt (có `Origin` / `Sec-Fetch-Site`) | 403                                           | — (Floci không gửi hai header này)         |
| Sai secret chung (không phải Floci gọi)          | 401                                                  | — (Floci luôn gửi đúng secret)             |
| `modelId` không thuộc profile nào                | 400 "No model profile handles {modelId}"             | 424 `ModelErrorException` kèm message      |
| Profile đang tắt                                 | 400 "Model profile {name} is disabled"               | Như trên                                   |
| Profile thiếu key (sau restart, sau Clear key)   | 400 "Model profile {name} needs an API key"          | Như trên                                   |
| Nguồn không tới được (Ollama chưa bật…)          | 502 kèm địa chỉ đã gọi                               | Như trên                                   |
| Nguồn từ chối (key sai, hết quota, 429)          | Chuyển nguyên status và body của nguồn               | Như trên. Bedrock thật trả 429 `ThrottlingException` và SDK tự retry; local thì không |
| Console không chạy                               | —                                                    | 424 "Proxy backend unavailable or disconnected." |
| Nguồn trả lời quá timeout (mục 4.3, stream thì tính tới chunk đầu) | —                                  | 408 `ModelTimeoutException` "Proxy backend timed out." / "Proxy stream timed out." |

---

## 6. Kỹ thuật

- **Web**: `web/src/services/bedrock/` (pages, components, hooks, schemas, constants) và một dòng trong `web/src/registry.ts`. Playground dùng SDK qua `proxyEndpoint()` giống `useS3`. Tab Connect dùng lại `CodeSnippet` và `environmentFor()` (đưa ra `shared/` nếu cần import từ service).
- **Server**: route `/llm-proxy` dùng `http-proxy-middleware` (đã có); phải đọc và sửa body để đổi `model`, nên body của route này được đọc trước khi chuyển tiếp. Route `/api/bedrock/*` theo mẫu `routes/redis`.
- **Package mới** (user tự cài): `npm install @aws-sdk/client-bedrock-runtime -w web --min-release-age=7`.
- **Compose**: thêm 4 biến và `command` (timeout) của mục 4.3 cho `floci`; `LLM_PROXY_KEY` cho `console` (cùng giá trị cố định với `PROXY_API_KEY`); một named volume cho file profile của `console`.
- **Dockerfile**: image chạy bằng `USER node`, nên thư mục chứa file profile phải tạo sẵn trong image và thuộc `node`, để volume mount vào ghi được.

---

## 7. Kết quả kiểm trên Floci thật (2026-11-19)

Floci `2.4.0` chế độ proxy, `PASSTHROUGH=true`, trỏ tới một endpoint OpenAI-compatible giả ghi lại mọi request. Gọi bằng HTTP thô (chưa qua AWS SDK).

### 7.1 Rủi ro đã kiểm

| #   | Kiểm                                                  | Kết quả                                                                                                   |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `PROXY_URL` là base URL hay đường dẫn đầy đủ           | **Base URL.** `…/llm-proxy` → Floci gọi `POST …/llm-proxy/chat/completions`, `Authorization: Bearer {PROXY_API_KEY}` |
| 2   | `modelId` có tới nguyên vẹn không                     | **Có.** Tên thường, inference profile (`global.…`), cả ARN đều nằm nguyên trong `model`                   |
| 3   | Lỗi tới app thế nào                                   | Mọi status → `424 ModelErrorException`, giữ body trong message (mục 5)                                    |
| 4   | `ConverseStream` có ra từng chunk                     | **Có.** Nguồn gửi 3 chunk cách 1 s, app nhận event `contentBlockDelta` cách đúng 1 s. Lỗi khi stream: 424 trước khi stream bắt đầu |
| 5   | Tool call trọn vòng                                   | **Được.** `toolSpec` → `tools`, `tool_calls` → `toolUse` (`stopReason: tool_use`), `toolResult` → message `role: tool`. `toolChoice` `any` → `required`, `tool` → `function` |
| 6   | Timeout                                               | Mặc định **60 s**, cả không stream lẫn stream (chunk đầu chậm) → 408 `ModelTimeoutException`. Đổi được bằng system property `-Dfloci.services.bedrock-runtime.proxy.request-timeout-seconds=N` (key có trong binary, tài liệu Floci không ghi). **Đặt bằng biến môi trường thì không có tác dụng.** Đã thử: 5 → cắt ở 5 s; 300 → request 70 s chạy xong, cả stream |

**Prototype `/llm-proxy`** (Node thuần, làm theo mục 4.2 và 4.4) đặt giữa Floci và endpoint giả, đã chạy đúng:

- Stream: 3 chunk cách 1 s đi qua Floci → `/llm-proxy` → nguồn, app nhận cách đúng 1 s (chuyển `fetch` body thẳng ra response, không gom).
- Lỗi không khớp / profile tắt / thiếu key: app nhận 424 kèm đúng message của mục 5.
- Chưa có profile: `Converse` và `ConverseStream` đều nhận câu stub (console tự trả format OpenAI, cả SSE).
- `response_format` được thêm `strict: true`; nguồn nhận `model` đã đổi và `Bearer` key của profile.
- Gọi thẳng có `Origin` → 403; sai key chung → 401.

### 7.2 Định dạng Converse → OpenAI

| Trường Converse                                 | Tới nguồn                               |
| ----------------------------------------------- | --------------------------------------- |
| `system`, `messages` text, `maxTokens`, `temperature`, `topP`, `stopSequences` | Có (`max_tokens`, `top_p`, `stop`…)     |
| `image` (bytes)                                 | Có, dạng `image_url` data URL           |
| `outputConfig.textFormat` (JSON schema)         | Có, thành `response_format` (nguồn tự áp schema) |
| `document`                                      | **Bị bỏ, không báo lỗi**                |
| `cachePoint`                                    | Bị bỏ; usage không có số token cache    |
| `reasoningContent` trong lịch sử                | Bị bỏ                                   |
| `additionalModelRequestFields` (vd: `thinking`, `top_k`) | Bị bỏ                          |
| `guardrailConfig`                               | Bị bỏ                                   |

App dùng các trường bị bỏ vẫn chạy nhưng kết quả khác production. Tab Connect ghi bảng này.

### 7.3 Còn lại

- `InvokeModel` ở chế độ proxy trả **400 `ValidationException`** ("use Converse"), không phải stub như ở chế độ stub. Vì Floci luôn ở chế độ proxy, app gọi `InvokeModel` mất cả stub (mục 9).
- Chưa kiểm bằng AWS SDK thật: SDK đọc 424 / 408 ra lỗi gì, có retry không. Kiểm ở bước Playground.

### 7.4 Provider Claude (endpoint OpenAI-compatible của Anthropic)

Theo [tài liệu của Anthropic](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk); chưa chạy thử, kiểm ở bước test (mục 8). Anthropic ghi endpoint này dành để test và so sánh, không khuyên dùng cho production, đúng mục đích ở đây.

| Điểm                                                                  | Ảnh hưởng                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `response_format` chỉ nhận `json_schema` có `strict: true`, khác → 400 | Floci gửi thiếu `strict` (mục 7.2) → console tự thêm (mục 4.4)     |
| Claude 4.7 trở lên: `temperature` < 1 hoặc `top_p` ≠ 0.99 → 400        | Ràng buộc của model; dev thấy lỗi như khi gọi Claude thật          |
| `tool_choice` ép tool (`required`, tên function) → 400 trên Opus 5.5, Sonnet 5.5, Fable 5.1 / 5.2 | Như trên                                  |
| Không trả nội dung thinking; không có prompt caching                  | Floci vốn đã bỏ `reasoningContent`, `cachePoint` (mục 7.2)         |
| `image_url` chạy; `file`, audio → 400                                  | Floci đã bỏ `document` trước khi tới                               |
| Bearer key nhận được (`Authorization` hỗ trợ đầy đủ)                    | Console gắn key như mọi provider, không cần xử lý riêng            |
| Model dùng tên của Claude API (`claude-…`), không phải `anthropic.claude-…` của Bedrock | Bảng Model IDs của profile map hai tên này               |

### 7.5 Subscription qua CLI (kiểm 2026-11-19)

| Điểm | Kết quả |
| ---- | ------- |
| Chạy CLI cách ly bằng subscription | Chạy được với `claude -p --safe-mode --tools "" --system-prompt "…" --strict-mcp-config --no-session-persistence --max-turns 1 --output-format stream-json --verbose --include-partial-messages < /dev/null` trong thư mục trống: không tool, không MCP, `apiKeySource: none` (login subscription), stream từng token. `--bare` không dùng được: không đọc OAuth / Keychain, chỉ nhận API key |
| Độ trễ | ~3,7 s / request, trong đó ~1,8 s là khởi động CLI (2 lần, model haiku) |
| Điều khoản Anthropic | Cấm bên thứ ba route request qua credential của plan Free / Pro / Max / Ultra thay cho user; đã chặn OpenClaw từ 4/2026. User tự chạy `claude -p` bằng plan của mình thì được, tính vào hạn mức subscription → console không hỗ trợ Claude bằng subscription (mục 9) |
| Điều khoản OpenAI | Tài liệu auth của Codex không cấm bên thứ ba; access token ChatGPT dành cho "trusted scripts, schedulers, and private CI runners"; đăng nhập ChatGPT đã có trong OpenCode… Chưa chạy thử (máy kiểm không có Codex) |
| Bridge có sẵn | Claude: claude-code-openai-wrapper, claude-max-api-proxy, OCP (dính điều khoản trên). Codex, Gemini CLI: CLIProxyAPI → không cần tự viết |

---

## 8. Thứ tự làm

1. ~~Kiểm rủi ro trên Floci thật~~ — xong 2026-11-19 (mục 7).
2. Compose (mục 4.3, 6) + route `/llm-proxy`: stub khi chưa có profile, chọn profile theo `modelId`.
3. API `/api/bedrock/profiles` + lưu profile ra file trong volume, key trong RAM.
4. Trang Bedrock: placeholder, danh sách, form profile, tab Connect; dòng trong `registry.ts`.
5. Tab Playground.
6. Test: integration với Floci thật và endpoint giả (`tests/it/`), một luồng E2E (`tests/e2e/`). Cập nhật README (Traps) và roadmap mục 5.

---

## 9. Quyết định

| Quyết định                                                     | Lý do                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bỏ Agent Bridge trong console (gọi Claude Code, Codex… bằng subscription) | Phải đưa phiên đăng nhập CLI vào container (macOS giữ login của Claude Code trong Keychain), mỗi request chậm vài giây, kết quả lệch model thuần. Lý do khác của bản định hướng (Floci không gọi được Claude nên cần lớp dịch) không còn: Claude có endpoint OpenAI-compatible, profile External provider trỏ thẳng tới (mục 7.4). Endpoint này vẫn cần API key, không thay được subscription |
| Subscription: ChatGPT qua bridge ngoài, Claude không hỗ trợ (2026-11-19) | **ChatGPT**: OpenAI không cấm dùng plan ChatGPT ngoài app của họ (đăng nhập ChatGPT đã có trong OpenCode…); bridge cộng đồng bọc Codex CLI đã có sẵn, chạy trên host nên dùng được login sẵn có; console chỉ cần profile Local endpoint, không thêm code. **Claude**: Anthropic không cho bên thứ ba "route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users", đã chặn tool như OpenClaw từ 4/2026. Repo công khai đưa sẵn bridge thì người dùng có thể bị khóa tài khoản, nên chỉ hỗ trợ Claude bằng API key (mục 7.5) |
| Floci luôn proxy về console thay vì nạp key thẳng vào Floci    | Cấu hình proxy của Floci là biến môi trường, chỉ đọc lúc khởi động; console tự restart Floci thì phải mount `docker.sock`, quá rủi ro |
| Nhiều profile, chọn theo `modelId`; không có start / stop       | Giống Bedrock thật: model serverless, app chọn model trong từng request. Enable / Disable thay cho start / stop |
| Chưa có profile nào → stub; có profile nhưng không khớp → lỗi  | Không có profile: app chạy như trước. Có profile mà không khớp: dev biết ngay map thiếu, giống Bedrock báo lỗi model chưa được cấp quyền |
| Lỗi trả cho app, không chỉ hiện trên UI                        | Server bắt buộc trả response cho mỗi request; UI không nằm trên đường đi của request. Banner trên UI để sau |
| Profile lưu ra file trong volume; key chỉ trong RAM            | Restart không phải tạo lại profile; key không nằm trên đĩa hay trình duyệt. Chỉ cần nhập lại key            |
| Disable giữ key; Delete xóa key                                | Disable thường để bật lại ngay; Delete là bỏ hẳn                                                            |
| Tab Connect có code mẫu `Converse`, một bản cho mọi loại profile | App gọi Floci giống nhau dù profile external hay local. Hai lỗi dễ gặp là gọi `InvokeModel` (nhận lỗi 400) và `modelId` không khớp profile; code mẫu chặn cả hai |
| Chỉ hỗ trợ `Converse` / `ConverseStream`, không làm `InvokeModel` | User chốt 2026-11-19. App chat / agent mới chủ yếu dùng `Converse`. Không phủ embedding (RAG), tạo ảnh, Anthropic Bedrock SDK, LangChain `ChatBedrock` |
| Floci luôn ở chế độ proxy, kể cả khi chưa có profile           | Đổi chế độ phải restart Floci. Cái giá: `InvokeModel` mất stub, trả 400 (mục 7.3). Chấp nhận vì app dùng `InvokeModel` vốn không nhận được câu trả lời thật |
| Console nằm trên đường request của Bedrock                      | Khác các service khác (console chỉ để xem). Console tắt → app gọi Bedrock nhận 424 "Proxy backend unavailable". Chạy chung compose nên chấp nhận; ghi vào README (Traps) |
| Cho nhập API key trên UI (đổi so với bản định hướng, mục 10 cũ: "không lưu credential trong UI") | Bỏ Agent Bridge thì API key là cách chính dùng model ngoài (trừ ChatGPT qua bridge ngoài). Key chỉ trong RAM, không xuống đĩa, không về trình duyệt |
| Công: L, xếp nhóm cần backend (như ElastiCache, MQ) trong roadmap | Ngoài frontend còn `/llm-proxy`, API profile, lưu file, giữ key, tự trả stub |
| Gọi loại profile là "External provider", không phải "custom model" | Trong Bedrock, custom model là model đã fine-tune / import, Floci không hỗ trợ                           |
| Secret chung giữa Floci và console: giá trị cố định trong compose, không bắt user đặt; `/llm-proxy` chặn thêm request có `Origin` / `Sec-Fetch-Site` | User chốt 2026-11-19. Port chỉ mở trên `127.0.0.1` nên máy khác trong LAN không gọi tới; trang web lạ bị chặn bởi CORS preflight và bởi kiểm header; process trên máy thì secret nào cũng không chặn được. Secret chỉ để chặn request đi nhầm cửa, không phải lớp bảo mật chính. Khác API key user nhập (console → provider) |

## 10. Tài liệu tham khảo

- [Floci Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/)
- [Floci Bedrock control-plane limitations](https://floci.io/floci/services/bedrock/)
- [Amazon Bedrock — Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [Claude — OpenAI SDK compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk)
- [Gemini — OpenAI compatibility](https://aistudio.google.com/docs/openai)
- [Claude Code — Legal and compliance (authentication and credential use)](https://code.claude.com/docs/en/legal-and-compliance)
- [Claude Code — Run programmatically (`--bare`)](https://code.claude.com/docs/en/headless)
- [Codex — Authentication](https://learn.chatgpt.com/docs/auth)
- [CLIProxyAPI](https://github.com/hmbown/cliproxyapi) (bridge cộng đồng cho Codex, Gemini CLI)
