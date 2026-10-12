import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class AcceptInvitationInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
