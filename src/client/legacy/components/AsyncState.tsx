import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-label="正在加载">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Inbox size={28} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <strong>加载失败</strong>
        <p>{message}</p>
      </div>
      {retry ? (
        <button className="button secondary" type="button" onClick={retry}>
          <RefreshCw size={15} /> 重试
        </button>
      ) : null}
    </div>
  );
}
