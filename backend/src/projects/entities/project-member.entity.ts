import { Field, ID, ObjectType } from '@nestjs/graphql';
import { User } from '../../users/entities/user.entity.js';

@ObjectType()
export class ProjectMember {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => ID)
  organizationId!: string;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => Date)
  createdAt!: Date;
}
