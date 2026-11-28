import { createContext, useContext, useState, type ReactNode } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/base/modal/modal";
import { IconExpand } from "@/icons";
import { cx } from "@/utils/cx";
import { Icon, IconButton } from "./controls";

const ExpandedContext = createContext(false);

/** True inside the full-screen copy of an Expandable, e.g. to give a chart more height. */
export const useExpanded = () => useContext(ExpandedContext);

/**
 * A section that can be opened full screen in a pop up. The same children
 * render in place and in the pop up; Esc, the close button, or a press on the
 * backdrop closes it.
 *
 * `placement="corner"` floats the button over the top end corner; `"above"`
 * gives it a row of its own, for content whose corner is already taken.
 */
export function Expandable({
  title,
  placement = "corner",
  flush = false,
  className,
  children,
}: {
  title: string;
  placement?: "corner" | "above";
  /** Corner button sits on the edge, for content without its own padding. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const nested = useExpanded();
  if (nested) return <>{children}</>;
  const button = (
    <IconButton
      icon={<Icon icon={IconExpand} />}
      label={`Perbesar ${title}`}
      tooltip="Perbesar"
      size="sm"
      variant="ghost"
      onClick={() => setOpen(true)}
    />
  );
  return (
    <div className={cx("oneflow-expandable relative flex min-w-0 flex-col", className)}>
      {placement === "corner" ? (
        <div className={cx("absolute z-10", flush ? "end-0 top-0" : "end-2 top-2")}>{button}</div>
      ) : (
        <div className="mb-1 flex justify-end">{button}</div>
      )}
      {children}
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="full"
        overlayClassName="p-0 sm:p-6"
        className="h-full max-sm:rounded-none max-sm:border-0"
      >
        <ModalHeader title={title} closeLabel="Tutup" />
        <ModalBody className="pb-2">
          <ExpandedContext.Provider value>{children}</ExpandedContext.Provider>
        </ModalBody>
      </Modal>
    </div>
  );
}
