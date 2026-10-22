import { Field, ObjectType } from '@nestjs/graphql';
import { Notification } from './notification.entity.js';

@ObjectType()
export class NotificationsPage {
  @Field(() => [Notification])
  items!: Notification[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field()
  hasMore!: boolean;
}
