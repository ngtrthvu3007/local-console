import "@cloudscape-design/global-styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import messages from "@cloudscape-design/components/i18n/messages/all.en";
import { applyTheme, type Theme } from "@cloudscape-design/components/theming";
import { QUERY_RETRY_COUNT } from "@shared/constants.ts";
import { router } from "./router.tsx";

const LOCALE = "en";
const ROOT_ELEMENT_ID = "root";

// Nút mặc định (viên thuốc, viền 2px) nhìn to và nặng cạnh input: bo góc bằng input, viền mảnh.
// Padding dọc bù 1px viền bớt đi để nút vẫn cao 32px, thẳng hàng với input.
const BUTTON_THEME: Theme = {
  tokens: {
    borderRadiusButton: "8px",
    borderWidthButton: "1px",
    spaceButtonVertical: "5px",
    spaceButtonHorizontal: "16px",
  },
};
applyTheme({ theme: BUTTON_THEME });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: QUERY_RETRY_COUNT, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById(ROOT_ELEMENT_ID)!).render(
  <StrictMode>
    {/* Chuỗi mặc định cho Table, TagEditor, Pagination… */}
    <I18nProvider locale={LOCALE} messages={[messages]}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
