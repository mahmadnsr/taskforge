import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Role } from '@prisma/client';

@ObjectType()
export class OrganizationInvitation {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field(() => Role)
  role!: Role;

  @Field()
  expiresAt!: Date;

  // Sirf dev me, invite banate waqt ek baar. Production me null (email se jayega, Phase 5)
  @Field(() => String, { nullable: true })
  inviteToken?: string | null;
}
