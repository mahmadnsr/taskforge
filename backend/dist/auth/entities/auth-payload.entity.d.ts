import { User } from '../../users/entities/user.entity.js';
export declare class AuthPayload {
    accessToken: string;
    refreshToken: string;
    user: User;
}
