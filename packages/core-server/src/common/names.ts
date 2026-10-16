const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/** Event, guard and filter names look like "stock.changed" or "orders.order.sending". */
export function assertValidName(kind: string, name: string): void {
  if (!NAME.test(name)) {
    throw new Error(
      `${kind} name "${name}" is not valid (expected <moduleId>.<noun>.<verb>, for example "stock.changed")`,
    );
  }
}

/** Events, guards and filters belong to the module whose id their name starts with. */
export function assertOwnName(owner: string, kind: string, name: string, action: string): void {
  assertValidName(kind, name);
  if (name !== owner && !name.startsWith(`${owner}.`)) {
    throw new Error(
      `module "${owner}" cannot ${action} ${kind} "${name}": its name has to start with the id of the module that owns it`,
    );
  }
}
