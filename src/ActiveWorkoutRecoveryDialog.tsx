import { useId, useRef } from "react";
import type { ActiveWorkoutDraft } from "./activeWorkoutDraft";
import { useDialogFocus } from "./useDialogFocus";

type ActiveWorkoutRecoveryDialogProps = {
  draft: ActiveWorkoutDraft;
  onResume: () => void;
  onDiscard: () => void;
};

function formatDraftDate(startedAt: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startedAt));
}

export default function ActiveWorkoutRecoveryDialog({
  draft,
  onResume,
  onDiscard,
}: ActiveWorkoutRecoveryDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(true, dialogRef, resumeRef, () => undefined);

  return (
    <div className="modal-backdrop active-draft-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="confirm-dialog active-draft-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <p className="eyebrow">Workout recovery</p>
        <h2 id={titleId}>Resume {draft.workoutName}?</h2>
        <p id={descriptionId}>
          A workout started {formatDraftDate(draft.startedAt)} is saved on this device with {draft.exercises.length}{" "}
          {draft.exercises.length === 1 ? "exercise" : "exercises"}. Choose whether to resume it or discard the saved draft.
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-cancel" onClick={onDiscard}>Discard draft</button>
          <button ref={resumeRef} type="button" className="confirm-action" onClick={onResume}>Resume workout</button>
        </div>
      </section>
    </div>
  );
}
