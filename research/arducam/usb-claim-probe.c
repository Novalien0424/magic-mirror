// Exact-device, reversible macOS libusb ownership experiment. No frame capture.
// Caller must hold the Electron lease, stop capture, and verify Jabra audio.
// Darwin capture detaches the WHOLE composite device, not just interface 1.
#include <libusb.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static volatile sig_atomic_t stopped;
static void stop(int sig) { (void)sig; stopped = 1; }
static void result(const char *name, int value) {
    printf("{\"event\":\"%s\",\"result\":%d}\n", name, value); fflush(stdout);
}
int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--claim")) return 2;
    if (geteuid() != 0) { result("root_required", -3); return 2; }
    signal(SIGINT, stop); signal(SIGTERM, stop);
    libusb_context *ctx = NULL;
    int rc = libusb_init(&ctx);
    if (rc) { result("init", rc); return 2; }
    libusb_set_option(ctx, LIBUSB_OPTION_LOG_LEVEL, LIBUSB_LOG_LEVEL_NONE);
    libusb_device **list = NULL, *selected = NULL;
    ssize_t count = libusb_get_device_list(ctx, &list);
    int matches = 0;
    for (ssize_t i = 0; i < count; ++i) {
        struct libusb_device_descriptor d;
        if (!libusb_get_device_descriptor(list[i], &d) && d.idVendor == 0x0c45 && d.idProduct == 0x0520) {
            matches++; selected = list[i];
        }
    }
    result("matched_devices", matches);
    libusb_device_handle *handle = NULL;
    int detached = 0, claimed[3] = {0}, ok = 0;
    struct libusb_config_descriptor *cfg = NULL;
    if (matches != 1 || stopped) goto cleanup;
    rc = libusb_get_active_config_descriptor(selected, &cfg);
    if (rc || cfg->bConfigurationValue != 1 || cfg->bNumInterfaces != 5) {
        result("configuration_mismatch", rc ? rc : -1); goto cleanup;
    }
    for (int i = 0; i < 3; ++i) {
        if (cfg->interface[i].num_altsetting < 1) goto cleanup;
        const struct libusb_interface_descriptor *a = &cfg->interface[i].altsetting[0];
        if (a->bInterfaceNumber != i || a->bInterfaceClass != 14 || a->bInterfaceSubClass != (i ? 2 : 1)) {
            result("video_interface_mismatch", i); goto cleanup;
        }
    }
    rc = libusb_open(selected, &handle); result("open", rc);
    if (rc || stopped) goto cleanup;
    for (int i = 0; i < 3; ++i) {
        char event[32]; snprintf(event, sizeof(event), "driver_before_%d", i);
        result(event, libusb_kernel_driver_active(handle, i));
    }
    rc = libusb_detach_kernel_driver(handle, 1); result("detach_composite", rc);
    if (rc) goto cleanup;
    detached = 1;
    ok = 1;
    for (int i = 0; i < 3 && !stopped; ++i) {
        rc = libusb_claim_interface(handle, i);
        char event[32]; snprintf(event, sizeof(event), "claim_%d", i); result(event, rc);
        if (rc) { ok = 0; break; }
        claimed[i] = 1;
    }
cleanup:
    for (int i = 2; i >= 0; --i) if (claimed[i]) {
        rc = libusb_release_interface(handle, i);
        char event[32]; snprintf(event, sizeof(event), "release_%d", i); result(event, rc);
        if (rc) ok = 0;
    }
    if (detached) {
        rc = libusb_attach_kernel_driver(handle, 1); result("restore_composite", rc);
        if (rc) ok = 0;
    }
    if (handle) libusb_close(handle);
    if (cfg) libusb_free_config_descriptor(cfg);
    if (list) libusb_free_device_list(list, 1);
    libusb_exit(ctx);
    result("interrupted", stopped != 0);
    return ok && !stopped ? 0 : 2;
}
