import { Modal, type ModalProps } from "./Modal";

/** Bottom sheet on phones, centred panel on larger screens. */
export function Sheet(props: Omit<ModalProps, "variant">) {
  return <Modal {...props} variant="sheet" />;
}
