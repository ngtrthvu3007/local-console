import { createBrowserRouter } from "react-router";
import { HOME_PATH } from "@shared/constants.ts";
import { NotFound } from "@shared/components/NotFound.tsx";
import { PageSpinner } from "@shared/components/PageState.tsx";
import { Layout } from "@shared/Layout.tsx";
import { lazyPage } from "@shared/lazyPage.ts";
import { servicePath, services } from "./registry.ts";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    // Lần tải đầu: chờ code của trang (tải lười) trước khi router vẽ Layout
    hydrateFallbackElement: <PageSpinner logo />,
    errorElement: (
      <Layout>
        <NotFound
          title='Unable to display this page'
          description='Something went wrong. Return to Console Home and try again.'
          backHref={HOME_PATH}
          backText='Back to Console Home'
        />
      </Layout>
    ),
    children: [
      {
        path: HOME_PATH,
        ...lazyPage(() => import("./pages/home/Home.tsx"), "Home"),
      },
      ...services.map((service) => ({
        path: servicePath(service),
        children: service.routes,
      })),
      {
        path: "*",
        element: (
          <NotFound
            title='Page not found'
            description="This page doesn't exist in Local Console."
            backHref={HOME_PATH}
            backText='Back to Console Home'
          />
        ),
      },
    ],
  },
]);
