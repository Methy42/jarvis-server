import { Module } from "@nestjs/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { BullModule } from "@nestjs/bull";

@Module({
    imports: [BullModule.registerQueue({
        name: 'whisper-queue',
    })],
    controllers: [UploadController],
    providers: [UploadService],
    exports: [UploadService]
})
export class UploadModule {
    constructor() {
        console.log('UploadModule');
    }
}