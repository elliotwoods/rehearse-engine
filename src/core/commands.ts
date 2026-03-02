import type { AppState } from "./types";

export interface CommandContext {
  getState(): AppState;
  setState(next: AppState): void;
}

export interface Command {
  id: string;
  label: string;
  execute(context: CommandContext): void;
  undo(context: CommandContext): void;
}

export interface SnapshotCommandOptions {
  id: string;
  label: string;
  before: AppState;
  after: AppState;
}

export class SnapshotCommand implements Command {
  public readonly id: string;
  public readonly label: string;
  private readonly before: AppState;
  private readonly after: AppState;

  public constructor(options: SnapshotCommandOptions) {
    this.id = options.id;
    this.label = options.label;
    this.before = options.before;
    this.after = options.after;
  }

  public execute(context: CommandContext): void {
    context.setState(structuredClone(context.getState()));
    context.setState(structuredClone(this.after));
  }

  public undo(context: CommandContext): void {
    context.setState(structuredClone(this.before));
  }
}

