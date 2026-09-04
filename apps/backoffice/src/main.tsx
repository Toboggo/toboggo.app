import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { queryClient } from "./lib/queryClient";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
