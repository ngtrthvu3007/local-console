import type { ReactNode } from "react";
import Container from "@cloudscape-design/components/container";
import Spinner from "@cloudscape-design/components/spinner";
import { isNotFoundError } from "@localconsole/core/shared";
import { LOGO_PATH } from "../constants.ts";
import { NotFound } from "./NotFound.tsx";
import { ErrorState, type FailableQuery } from "./TableStates.tsx";

const LOADING_LABEL = "Loading";
const DEFAULT_NOT_FOUND_DESCRIPTION = "It may have been deleted, or the name is wrong.";

// Spinner giữa vùng nội dung. Chờ một nhịp mới hiện (CSS) để trang tải nhanh không bị nhấp nháy.
// logo: màn hình chờ lần đầu mở console
export function PageSpinner({ logo = false }: { logo?: boolean }) {
  return (
    <div className='console-page-loading' role='status' aria-label={LOADING_LABEL}>
      {logo && <img src={LOGO_PATH} alt='' className='console-page-loading__logo' />}
      <Spinner size='large' />
    </div>
  );
}

interface PageStateOptions {
  ready: boolean; // đã có dữ liệu để vẽ trang
  notFound?: boolean; // mặc định: lỗi "không tồn tại" của AWS
  title: string; // vd: "Table orders not found"
  backHref: string;
  backText: string;
  description?: string;
}

// Thứ tự chung của trang detail: đang tải → không tồn tại → lỗi → undefined (vẽ trang)
export function pageState(
  query: FailableQuery & { isLoading: boolean },
  {
    ready,
    notFound = query.isError && isNotFoundError(query.error),
    description = DEFAULT_NOT_FOUND_DESCRIPTION,
    ...back
  }: PageStateOptions,
): ReactNode | undefined {
  if (query.isLoading) return <PageSpinner />;
  if (notFound) return <NotFound description={description} {...back} />;

  if (!ready) {
    return (
      <Container>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Container>
    );
  }

  return undefined;
}
