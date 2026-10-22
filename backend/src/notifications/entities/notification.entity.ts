import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { NotificationType } from '@prisma/client';

registerEnumType(NotificationType, {
  name: 'NotificationType',
});

@ObjectType()
export class Notification {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organizationId!: string;

  @Field(() => ID)
  taskId!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field()
  message!: string;

  @Field(() => Date, { nullable: true })
  readAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}
