import { Module } from "@nestjs/common";
import { WhisperService } from "./whisper.service";
import { BullModule } from "@nestjs/bull";

@Module({
    imports: [BullModule.registerQueue({
        name: 'whisper-queue',
    })],
    providers: [WhisperService],
    exports: [WhisperService]
})
export class WhisperModule { }