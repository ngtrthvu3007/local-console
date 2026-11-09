import { createBrowserRouter } from "react-router";
import { HOME_PATH } from "@shared/constants.ts";
import { Layout } from "@shared/Layout.tsx";
import { Home } from "./pages/home/Home.tsx";
import { servicePath, services } from "./registry.ts";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: HOME_PATH, element: <Home /> },
      ...services.map((service) => ({ path: servicePath(service), children: service.routes })),
    ],
  },
]);
