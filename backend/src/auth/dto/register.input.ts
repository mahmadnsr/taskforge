import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class RegisterInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Field()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Field()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  organizationName: string;
}
