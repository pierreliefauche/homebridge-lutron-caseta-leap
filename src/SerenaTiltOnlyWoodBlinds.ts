import {
    Service,
    PlatformAccessory,
    CharacteristicValue,
    CharacteristicSetCallback,
    CharacteristicGetCallback,
} from 'homebridge';

import { LutronCasetaLeap } from './platform';
import { OneZoneStatus, Response, SmartBridge, Device } from 'lutron-leap';

export class SerenaTiltOnlyWoodBlinds {
    private service: Service;
    private device: Device;

    constructor(
        private readonly platform: LutronCasetaLeap,
        private readonly accessory: PlatformAccessory,
        private readonly bridge: Promise<SmartBridge>,
    ) {
        this.device = accessory.context.device;

        this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Lutron Electronics Co., Inc')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, this.device.ModelNumber)
            .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, this.device.SerialNumber);

        this.service =
            this.accessory.getService(this.platform.api.hap.Service.WindowCovering) ||
            this.accessory.addService(this.platform.api.hap.Service.WindowCovering);

        this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, this.device.FullyQualifiedName.join(' '));

        // create handlers for required characteristics

        const getter = ((cb: CharacteristicGetCallback) => {
            this.handleCurrentPositionGet().then((pos: number) => {
                cb(null, pos);
            }, (e: Error) => {
                cb(e);
            });
        }).bind(this);

        const setter = ((pos: CharacteristicValue, cb: CharacteristicSetCallback) => {
            this.handleTargetPositionSet(pos).then(() => {
                cb(null, pos);
            }, (e: Error) => {
                cb(e);
            });
        }).bind(this);

        this.service.getCharacteristic(this.platform.api.hap.Characteristic.CurrentPosition)
            .on(this.platform.api.hap.CharacteristicEventTypes.GET, getter);

        this.service.getCharacteristic(this.platform.api.hap.Characteristic.TargetPosition)
            .on(this.platform.api.hap.CharacteristicEventTypes.GET, getter)
            .on(this.platform.api.hap.CharacteristicEventTypes.SET, setter);

        this.service.getCharacteristic(this.platform.api.hap.Characteristic.PositionState)
            .on(this.platform.api.hap.CharacteristicEventTypes.GET, this.handlePositionStateGet.bind(this));

        this.platform.on('unsolicited', this.handleUnsolicited.bind(this));

    }

    // `value` can range from 0-100, but n.b. 50 is flat. The Homekit
    // Window Covering's required "Position" characteristic expects 0 to be
    // "fully closed" and 100 to be "fully open".

    async handleCurrentPositionGet(): Promise<number> {
        this.platform.log.info('blinds', this.device.FullyQualifiedName.join(' '), 'were asked for current or target position');
        const bridge = await this.bridge;
        const tilt = await bridge.readBlindsTilt(this.device);
        return tilt;
    }

    async handleTargetPositionSet(value: CharacteristicValue): Promise<void> {
        const val = Number(value);
        this.platform.log.info('blinds', this.device.FullyQualifiedName.join(' '), 'were set to value', val);
        const bridge = await this.bridge;
        await bridge.setBlindsTilt(this.device, val);

    }

    handlePositionStateGet(cb: CharacteristicGetCallback): void {
        cb(null, this.platform.api.hap.Characteristic.PositionState.STOPPED);
    }

    handleUnsolicited(response: Response): void {
        if ((response.Body as OneZoneStatus)?.ZoneStatus?.Zone?.href === this.device.LocalZones[0].href) {
            const val = (response.Body as OneZoneStatus).ZoneStatus.Tilt;
            this.platform.log.info('accessory', this.accessory.UUID, 'got a response with value', val);

            this.accessory.getService(this.platform.api.hap.Service.WindowCovering)!
                .getCharacteristic(this.platform.api.hap.Characteristic.TargetPosition)
                .updateValue(val);

            this.accessory.getService(this.platform.api.hap.Service.WindowCovering)!
                .getCharacteristic(this.platform.api.hap.Characteristic.CurrentPosition)
                .updateValue(val);
        }
    }

}
