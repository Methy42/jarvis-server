import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadModule } from './upload/upload.module';
import { WhisperModule } from './whisper/whisper.module';
import { BullModule } from '@nestjs/bull';

@Module({
    imports: [
        BullModule.forRoot({
            redis: {
                host: 'localhost',
                port: 6379,
            },
        }),
        UploadModule,
        WhisperModule
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule { }
