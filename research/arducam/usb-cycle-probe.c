// Targeted reversible diagnostic, not installed in production recovery.
// Run only under the Electron owner lease, after capture is released and with
// Jabra verified as microphone. No seizing, hub reset or identifiers in output.
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static volatile sig_atomic_t interrupted = 0;
static void stop_wait(int number) { (void)number; interrupted = 1; }
static int matches(io_service_t service, CFStringRef key, int64_t wanted) {
    CFTypeRef value = IORegistryEntryCreateCFProperty(service, key, kCFAllocatorDefault, 0);
    int64_t number = -1;
    int result = value && CFGetTypeID(value) == CFNumberGetTypeID()
        && CFNumberGetValue(value, kCFNumberSInt64Type, &number) && number == wanted;
    if (value) CFRelease(value);
    return result;
}
static int suspended(IOUSBDeviceInterface320 **device) {
    UInt32 bits = 0;
    if ((*device)->GetUSBDeviceInformation(device, &bits) != kIOReturnSuccess) return -1;
    return (bits & kUSBInformationDeviceIsSuspendedMask) ? 1 : 0;
}
int main(int argc, char **argv) {
    if (argc != 2 || (strcmp(argv[1], "suspend") && strcmp(argv[1], "configure") && strcmp(argv[1], "resume"))) return 2;
    signal(SIGTERM, stop_wait); signal(SIGINT, stop_wait);
    io_iterator_t iterator = IO_OBJECT_NULL;
    IOReturn enumeration = IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOUSBHostDevice"), &iterator);
    if (enumeration != kIOReturnSuccess) { puts("{\"reason\":\"enumeration_failed\"}"); return 2; }
    io_service_t service, selected = IO_OBJECT_NULL;
    int count = 0;
    while ((service = IOIteratorNext(iterator))) {
        if (matches(service, CFSTR("idVendor"), 0x0c45) && matches(service, CFSTR("idProduct"), 0x0520)) {
            ++count;
            if (!selected) { selected = service; continue; }
        }
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    if (count != 1) {
        if (selected) IOObjectRelease(selected);
        printf("{\"matchedCount\":%d,\"reason\":\"unique_device_required\"}\n", count); return 2;
    }
    IOCFPlugInInterface **plugin = NULL; SInt32 score = 0;
    IOReturn access = IOCreatePlugInInterfaceForService(selected, kIOUSBDeviceUserClientTypeID,
        kIOCFPlugInInterfaceID, &plugin, &score);
    IOObjectRelease(selected);
    if (access != kIOReturnSuccess || !plugin) { puts("{\"reason\":\"access_failed\"}"); return 2; }
    IOUSBDeviceInterface320 **device = NULL;
    HRESULT query = (*plugin)->QueryInterface(plugin, CFUUIDGetUUIDBytes(kIOUSBDeviceInterfaceID320), (LPVOID *)&device);
    IODestroyPlugInInterface(plugin);
    if (query || !device) { puts("{\"reason\":\"interface_failed\"}"); return 2; }
    IOReturn opened = (*device)->USBDeviceOpen(device);
    if (opened != kIOReturnSuccess) {
        printf("{\"openResult\":%u,\"reason\":\"open_failed\"}\n", opened);
        (*device)->Release(device); return 2;
    }
    int before = suspended(device), during = -1, after = -1;
    UInt8 original = 0, changed = 0, restored = 0;
    IOReturn configRead = (*device)->GetConfiguration(device, &original);
    IOReturn configDuring = kIOReturnUnsupported, configAfter = kIOReturnUnsupported;
    IOReturn action = kIOReturnUnsupported, cleanup = kIOReturnUnsupported;
    if (!strcmp(argv[1], "configure")) {
        if (configRead == kIOReturnSuccess && original != 0) {
            action = (*device)->SetConfiguration(device, 0);
            configDuring = (*device)->GetConfiguration(device, &changed);
            if (action == kIOReturnSuccess && !interrupted) sleep(2);
            // Restore even after a failed request; do not assume failure was inert.
            cleanup = (*device)->SetConfiguration(device, original);
            configAfter = (*device)->GetConfiguration(device, &restored);
        }
    } else {
        if (!strcmp(argv[1], "suspend")) {
            action = (*device)->USBDeviceSuspend(device, true);
            during = suspended(device);
            if (action == kIOReturnSuccess && !interrupted) sleep(2);
        }
        cleanup = (*device)->USBDeviceSuspend(device, false);
        after = suspended(device);
    }
    printf("{\"operation\":\"%s\",\"matchedCount\":1,\"openResult\":%u,\"actionResult\":%u,\"cleanupResult\":%u,"
        "\"suspendedBefore\":%d,\"suspendedDuring\":%d,\"suspendedAfter\":%d,"
        "\"configurationReadResult\":%u,\"configurationDuringReadResult\":%u,\"configurationAfterReadResult\":%u,"
        "\"configurationBefore\":%u,\"configurationDuring\":%u,\"configurationAfter\":%u}\n",
        argv[1], opened, action, cleanup, before, during, after, configRead, configDuring, configAfter, original, changed, restored);
    (*device)->USBDeviceClose(device); (*device)->Release(device);
    return cleanup == kIOReturnSuccess ? 0 : 2;
}
