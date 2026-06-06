import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';
import { VoiceService } from './voice.service';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatModule } from '../chat/chat.module';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [
    UsersModule,
    ChatModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [VoiceGateway, VoiceService, WsJwtGuard],
})
export class VoiceModule {}
