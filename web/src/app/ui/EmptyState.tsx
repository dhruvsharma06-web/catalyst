import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface Props {
  icon: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

/** Says exactly what to do next. */
export function EmptyState({ icon, title, children, action }: Props) {
  return (
    <div className="hx-empty">
      <span className="hx-empty__icon" aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="hx-empty__title">{title}</h2>
      <p className="hx-empty__text">{children}</p>
      {action && <div className="hx-empty__action">{action}</div>}
    </div>
  );
}
