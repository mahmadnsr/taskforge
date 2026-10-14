import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ProjectStatus } from '@prisma/client';

registerEnumType(ProjectStatus, { name: 'ProjectStatus' });

@ObjectType()
export class Project {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organizationId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => ProjectStatus)
  status!: ProjectStatus;

  @Field(() => ID)
  createdById!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
