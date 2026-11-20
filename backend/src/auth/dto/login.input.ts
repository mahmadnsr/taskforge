import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
