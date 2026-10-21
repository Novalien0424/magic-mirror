// Diagnostic only: decode only bytes preceding the first reported USB hole.
// Returned rows bound progress from that prefix, not visually damaged area.
// No output image, face decision, repair, or relaxed acceptance is produced.
#include <jpeglib.h>
#include <setjmp.h>
typedef struct {
    struct jpeg_decompress_struct decoder;
    struct jpeg_error_mgr errors;
    jmp_buf escape;
    unsigned rows, row_height;
    int eligible;
    unsigned char row[1920*3];
} JpegPrefixState;
static void jpeg_prefix_stop(j_common_ptr common) {
    JpegPrefixState *s = (JpegPrefixState *)common->client_data;
    longjmp(s->escape,1);
}
static void jpeg_prefix_message(j_common_ptr common, int level) {
    if (level < 0) jpeg_prefix_stop(common);
}
static unsigned jpeg_prefix_rows(const unsigned char *bytes, size_t count) {
    if (!bytes || count < 4 || count > 8*1024*1024) return 0;
    JpegPrefixState *s = calloc(1,sizeof(*s));
    if (!s) return 0;
    s->decoder.err = jpeg_std_error(&s->errors);
    s->errors.error_exit = jpeg_prefix_stop;
    s->errors.emit_message = jpeg_prefix_message;
    s->decoder.client_data = s;
    if (!setjmp(s->escape)) {
        jpeg_create_decompress(&s->decoder);
        s->decoder.mem->max_memory_to_use = 32*1024*1024;
        jpeg_mem_src(&s->decoder,bytes,(unsigned long)count);
        if (jpeg_read_header(&s->decoder,TRUE) == JPEG_HEADER_OK &&
            s->decoder.image_width == 1920 && s->decoder.image_height == 1080 &&
            s->decoder.data_precision == 8 && !s->decoder.progressive_mode &&
            !s->decoder.arith_code && s->decoder.num_components == 3 &&
            !jpeg_has_multiple_scans(&s->decoder)) {
            s->decoder.out_color_space = JCS_RGB;
            s->decoder.do_fancy_upsampling = FALSE;
            s->decoder.scale_num = 1; s->decoder.scale_denom = 1;
            s->row_height = DCTSIZE*(unsigned)s->decoder.max_v_samp_factor;
            s->eligible = s->row_height > 0 && s->row_height <= 32;
            if (s->eligible && jpeg_start_decompress(&s->decoder)) {
                while (s->decoder.output_scanline < 1080) {
                    JSAMPROW row = s->row;
                    if (jpeg_read_scanlines(&s->decoder,&row,1) != 1) break;
                    s->rows = s->decoder.output_scanline;
                }
                (void)jpeg_finish_decompress(&s->decoder);
            }
        }
    }
    unsigned rows = s->eligible ? s->rows-s->rows%s->row_height : 0;
    if (s->decoder.mem) jpeg_destroy_decompress(&s->decoder);
    volatile unsigned char *wipe = (volatile unsigned char *)s;
    for (size_t i=0;i<sizeof(*s);++i) wipe[i]=0;
    free(s);
    return rows;
}
