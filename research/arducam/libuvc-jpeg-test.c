// Synthetic marker parsing only. The renamed probe entry point is never run.
#define main unused_probe_entry
#include "libuvc-fullhd-probe.c"
#undef main
#include <assert.h>
int main(void) {
    const unsigned char sample[] = {255,216,255,224,0,6,255,217,0,0,
        255,218,0,2,255,0,255,208,17,255,217,0,0};
    const size_t end = sizeof(sample)-2;
    assert(jpeg_extent(sample,sizeof(sample)) == end);
    for (size_t n = 0; n < end; ++n) assert(jpeg_extent(sample,n) == 0);
    unsigned char copy[sizeof(sample)];
    for (unsigned a = 0; a < 256; ++a) for (unsigned b = 0; b < 256; ++b) {
        memcpy(copy,sample,sizeof(sample)); copy[4] = a; copy[5] = b;
        size_t result = jpeg_extent(copy,sizeof(copy));
        assert(result == 0 || result <= sizeof(copy));
    }
    // A generated image establishes the independent decoder accepts complete
    // data and rejects missing entropy even when a final EOI is still present.
    unsigned char *pixels = malloc(1920*1080*3), *encoded = NULL;
    assert(pixels);
    for (size_t i = 0; i < 1920*1080*3; ++i) pixels[i] = (unsigned char)(i*31+i/137);
    tjhandle compressor = tj3Init(TJINIT_COMPRESS), decoder = tj3Init(TJINIT_DECOMPRESS);
    assert(compressor && decoder);
    assert(!tj3Set(compressor,TJPARAM_QUALITY,95));
    assert(!tj3Set(compressor,TJPARAM_SUBSAMP,TJSAMP_422));
    assert(!tj3Set(decoder,TJPARAM_STOPONWARNING,1));
    assert(!tj3Set(decoder,TJPARAM_MAXPIXELS,1920*1080));
    size_t encoded_length = 0;
    assert(!tj3Compress8(compressor,pixels,1920,1920*3,1080,TJPF_RGB,&encoded,&encoded_length));
    assert(jpeg_prefix_rows(encoded,encoded_length) == 1080);
    assert(jpeg_prefix_rows(encoded,4) == 0);
    unsigned prior_rows = 0;
    for (unsigned part = 1; part < 20; ++part) {
        unsigned rows = jpeg_prefix_rows(encoded,encoded_length*part/20);
        assert(rows >= prior_rows && rows < 1080 && rows%8 == 0);
        prior_rows = rows;
    }
    assert(jpeg_extent(encoded,encoded_length) == encoded_length);
    assert(!tj3DecompressHeader(decoder,encoded,encoded_length));
    assert(tj3Get(decoder,TJPARAM_JPEGWIDTH)==1920 && tj3Get(decoder,TJPARAM_JPEGHEIGHT)==1080);
    assert(!tj3Decompress8(decoder,encoded,encoded_length,pixels,1920*3,TJPF_RGB));
    size_t damaged_length = encoded_length*3/4;
    encoded[damaged_length-2] = 255; encoded[damaged_length-1] = 217;
    assert(jpeg_extent(encoded,damaged_length) == damaged_length);
    assert(tj3Decompress8(decoder,encoded,damaged_length,pixels,1920*3,TJPF_RGB) < 0);
    assert(tj3GetErrorCode(decoder) == TJERR_WARNING);
    // Frame-loss records are bounded, sequence checked, and do not confuse a
    // later ring occupant with an older delivered frame.
    mm_uvc_note_gap(17,400); mm_uvc_note_gap(17,500); mm_uvc_frame_info(17,1000,100);
    uvc_frame_t frame = {.sequence=17,.data_bytes=1000};
    FrameLoss loss = frame_loss(&frame);
    assert(loss.occupied && loss.gaps==2 && loss.first_gap==400);
    mm_uvc_frame_info(17+64,1000,200);
    assert(!frame_loss(&frame).occupied);
    tj3Free(encoded); tj3Destroy(decoder); tj3Destroy(compressor); free(pixels);
    puts("{\"jpegMarkerTests\":\"passed\",\"lengthPairs\":65536,\"completeSyntheticJpeg\":\"accepted\",\"truncatedEntropyWithEOI\":\"rejected\",\"prefixProgress\":\"passed\",\"lossSequenceMapping\":\"passed\",\"hardwareIO\":false}");
    return 0;
}
