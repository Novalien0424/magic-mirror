// macOS 27 feasibility probe. Enumeration only: never opens/captures USB.
#import <AppKit/AppKit.h>
#import <AccessoryAccess/AccessoryAccess.h>
#import <IOUSBHost/IOUSBHost.h>

@interface CameraAccessoryProbe : NSObject <NSApplicationDelegate, AAUSBAccessoryListener>
@property(nonatomic) BOOL finished;
@property(nonatomic, strong) NSWindow *window;
@end
@implementation CameraAccessoryProbe
- (void)finish:(NSDictionary *)result {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.finished) return;
        self.finished = YES;
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout);
        [NSApp terminate:nil];
    });
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 480, 120)
        styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Camera USB diagnostic — enumeration only";
    NSTextField *label = [NSTextField labelWithString:@"Checking supported USB access. No camera capture or reset."];
    label.frame = NSMakeRect(20, 45, 440, 30); [self.window.contentView addSubview:label];
    [self.window makeKeyAndOrderFront:nil];
    NSDictionary *matching = CFBridgingRelease([IOUSBHostDevice createMatchingDictionaryWithVendorID:@0x0c45
        productID:@0x0520 bcdDevice:nil deviceClass:nil deviceSubclass:nil deviceProtocol:nil speed:nil productIDArray:nil]);
    AAUSBAccessoryMatchingCriteria *criteria = [[AAUSBAccessoryMatchingCriteria alloc] initWithDeviceMatchingDictionary:matching];
    [[AAUSBAccessoryManager sharedManager] registerListener:self withMatchingCriteria:@[criteria]
        completionHandler:^(NSArray<AAUSBAccessory *> *accessories, NSError *error) {
            // No names, registry IDs, serials, error strings or device bytes leave RAM.
            [self finish:@{@"registered": @(error == nil), @"matchedCount": @(accessories.count),
                @"errorCode": @(error ? error.code : 0), @"accessoryErrorDomain": @([error.domain isEqualToString:AAErrorDomain]),
                @"opened": @NO, @"captured": @NO, @"timeout": @NO}];
        }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [self finish:@{@"registered": @NO, @"opened": @NO, @"captured": @NO, @"timeout": @YES}];
    });
}
@end

int main(void) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        CameraAccessoryProbe *delegate = [CameraAccessoryProbe new];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
