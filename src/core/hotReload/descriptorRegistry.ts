import type { ReloadableDescriptor } from "./types";

export class DescriptorRegistry {
  private readonly descriptors = new Map<string, ReloadableDescriptor>();

  public register(descriptor: ReloadableDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  public replaceDescriptor(descriptor: ReloadableDescriptor): {
    previous?: ReloadableDescriptor;
    current: ReloadableDescriptor;
  } {
    const previous = this.descriptors.get(descriptor.id);
    this.descriptors.set(descriptor.id, descriptor);
    return {
      previous,
      current: descriptor
    };
  }

  public get(id: string): ReloadableDescriptor | undefined {
    return this.descriptors.get(id);
  }

  public listByKind(kind: ReloadableDescriptor["kind"]): ReloadableDescriptor[] {
    return [...this.descriptors.values()].filter((entry) => entry.kind === kind);
  }

  public all(): ReloadableDescriptor[] {
    return [...this.descriptors.values()];
  }
}

