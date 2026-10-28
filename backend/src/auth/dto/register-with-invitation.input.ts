import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class RegisterWithInvitationInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'Name must contain a non-whitespace character' })
  @MaxLength(100)
  name!: string;

  @Field()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'Invitation token must not be blank',
  })
  @MaxLength(128)
  invitationToken!: string;
}
