import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive confirmation in plain words; focus starts on the safe choice. */
export function ConfirmDialog({ open, title, message, confirmLabel, pending, error, onConfirm, onCancel }: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button data-autofocus onClick={onCancel}>
            Keep it
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {error && (
        <p role="alert" className="hx-form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
