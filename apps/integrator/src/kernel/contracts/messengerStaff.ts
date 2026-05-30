export type MessengerStaffChannel = 'telegram' | 'max';

export type ResolveMessengerStaffAdmin = (
  channel: MessengerStaffChannel,
  actorId: string,
) => Promise<boolean>;
