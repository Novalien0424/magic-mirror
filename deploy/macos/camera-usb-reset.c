#include "camera-usb-reset.h"
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>

static int number_matches(io_service_t service, CFStringRef key, uint32_t expected) {
    CFTypeRef value = IORegistryEntryCreateCFProperty(service, key, kCFAllocatorDefault, 0);
    int64_t number = -1;
    int matches = value && CFGetTypeID(value) == CFNumberGetTypeID()
        && CFNumberGetValue(value, kCFNumberSInt64Type, &number) && number == expected;
    if (value) CFRelease(value);
    return matches;
}

int mirror_camera_usb_reset(uint32_t location, uint16_t vendor, uint16_t product) {
    if (!location || !vendor || !product) return 1;
    io_iterator_t iterator = IO_OBJECT_NULL;
    if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOUSBHostDevice"), &iterator) != KERN_SUCCESS) return 3;
    io_service_t selected = IO_OBJECT_NULL, service;
    int count = 0;
    while ((service = IOIteratorNext(iterator))) {
        if (number_matches(service, CFSTR("locationID"), location)
            && number_matches(service, CFSTR("idVendor"), vendor)
            && number_matches(service, CFSTR("idProduct"), product)) {
            count++;
            if (!selected) { selected = service; continue; }
        }
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    if (!selected) return 1;
    if (count != 1) { IOObjectRelease(selected); return 2; }

    IOCFPlugInInterface **plugin = NULL;
    SInt32 score = 0;
    IOReturn result = IOCreatePlugInInterfaceForService(selected,
        kIOUSBDeviceUserClientTypeID, kIOCFPlugInInterfaceID, &plugin, &score);
    IOObjectRelease(selected);
    if (result != kIOReturnSuccess || !plugin) return 3;
    IOUSBDeviceInterface320 **device = NULL;
    HRESULT query = (*plugin)->QueryInterface(plugin,
        CFUUIDGetUUIDBytes(kIOUSBDeviceInterfaceID320), (LPVOID *)&device);
    IODestroyPlugInInterface(plugin);
    if (query || !device) return 3;
    // Capture has already been released. Never seize interfaces or reset a hub.
    result = (*device)->USBDeviceOpen(device);
    if (result != kIOReturnSuccess) { (*device)->Release(device); return 4; }
    result = (*device)->USBDeviceReEnumerate(device, 0);
    (*device)->USBDeviceClose(device);
    (*device)->Release(device);
    return result == kIOReturnSuccess ? 0 : 5;
}
