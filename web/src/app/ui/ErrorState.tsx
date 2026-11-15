import { errorMessage } from "../../api/errors";
import { Button } from "./Button";

/** Plain-language failure with a retry; surrounding input is never cleared. */
export function ErrorState({ error, onRetry, title = "We couldn't load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="hx-error" role="alert">
      <p className="hx-error__title">{title}</p>
      <p className="hx-error__text">{errorMessage(error)}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
