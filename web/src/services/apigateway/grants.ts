// Sửa mà giữ function cũ thì không thêm quyền lại: trùng statement Lambda trả 409,
// trình duyệt ghi console.error dù console bỏ qua lỗi đó.
// sameTarget = false: SourceArn đổi (route key mới) nên phải cấp lại dù function như cũ
export const grantIfChanged = <T extends { grant: boolean; functionArn: string }>(
  values: T,
  currentArn = "",
  sameTarget = true,
) => ({
  ...values,
  grant: values.grant && (values.functionArn !== currentArn || !sameTarget),
});
