import type { RequestHandler } from "express";
import { HTTP_FORBIDDEN } from "../constants.ts";
import { HttpError } from "./error.ts";

const FORBIDDEN_ERROR_CODE = "Forbidden";
// Host lạ = DNS rebinding: tên miền của trang khác trỏ về 127.0.0.1 để đọc được API
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Trình duyệt tự gắn Sec-Fetch-Site; "none" = user tự gõ URL. Thiếu header = curl/test, không
// phải trình duyệt. "same-site" vẫn chặn vì app khác chạy trên localhost cổng khác cũng là same-site
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

// API không có đăng nhập nên chỉ nhận request từ chính console: trang web khác đang mở trong
// trình duyệt không được gọi (CSRF), vd: POST flush Redis
export const localOnly: RequestHandler = (request, _response, next) => {
  const fetchSite = request.get("sec-fetch-site");
  if (
    !LOCAL_HOSTNAMES.has(request.hostname) ||
    (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite))
  ) {
    next(
      new HttpError(HTTP_FORBIDDEN, FORBIDDEN_ERROR_CODE, "Only Local Console can call this API"),
    );
    return;
  }
  next();
};
