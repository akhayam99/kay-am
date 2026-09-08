type Props = {
  readonly saveLabel: string;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
};

export const ComposerActionRow = ({ saveLabel, disabled, onCancel, onSave }: Props) => (
  <div className="flex items-center justify-end gap-1">
    <button
      type="button"
      onClick={onCancel}
      className="rounded-sm px-2 py-0.5 text-3xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      Cancel
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-sm bg-foreground px-2 py-0.5 text-3xs font-medium text-background hover:opacity-80 disabled:opacity-30"
    >
      {saveLabel}
    </button>
  </div>
);
