// Index của StackLink dùng lại trong khoảng này
export const RESOURCE_INDEX_STALE_MS = 30_000;
// Floci không bỏ qua resource đã mất khi xóa stack (spec 7 #16): người dùng tự gỡ rồi xóa lại
export const DELETE_FAILED_HINT =
  "Floci couldn't delete these resources. Fix them, then delete the stack again. A resource deleted by hand must be created again with the same name first.";
export const TLS_HINT =
  "Node.js custom resources (CDK autoDeleteObjects, BucketDeployment…) need Floci started with FLOCI_TLS_ENABLED=true.";
export const EDIT_TEMPLATE_NOTE =
  "Deploying this stack again from a file replaces changes made here.";
export const NO_CHANGES_NOTICE = "No changes to deploy.";
export const TEMPLATE_EDITOR_HEIGHT_PX = 480;
