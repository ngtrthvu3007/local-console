import { createBrowserRouter } from "react-router";
import { HOME_PATH } from "@shared/constants.ts";
import { NotFound } from "@shared/components/NotFound.tsx";
import { Layout } from "@shared/Layout.tsx";
import { Home } from "./pages/home/Home.tsx";
import { servicePath, services } from "./registry.ts";

export const router = createBrowserRouter([
  {
    element: <Layout />,
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
      { path: HOME_PATH, element: <Home /> },
      ...services.map((service) => ({ path: servicePath(service), children: service.routes })),
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
