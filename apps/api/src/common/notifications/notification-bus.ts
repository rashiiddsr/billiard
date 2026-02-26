import { EventEmitter } from 'events';

export const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(100);

export interface NotificationEventPayload {
  userId: string;
  notificationId: string;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  createdAt: Date;
}
