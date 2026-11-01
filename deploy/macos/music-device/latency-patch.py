# Patch BlackHole.c (v0.7.1) for Magic Mirror Music: the device reports a configurable
# output latency so Chromium/AVPlayer delay pictures to match Airfoil's playout delay.
# The HAL treats kAudioDevicePropertyLatency as read-only, so the value is set through a
# custom device property 'mmlt' (CFNumber, frames at 48 kHz), persisted in the plug-in's
# storage. The input side (read by Airfoil) always reports 0.
import sys

path = sys.argv[1]
s = open(path).read()


def once(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:90])
    s = s.replace(old, new)


SWITCH = "\tswitch(inAddress->mSelector)\n\t{\n"


once("static pthread_mutex_t              gPlugIn_StateMutex                  = PTHREAD_MUTEX_INITIALIZER;",
     "static pthread_mutex_t              gPlugIn_StateMutex                  = PTHREAD_MUTEX_INITIALIZER;\n"
     "// Magic Mirror: output latency reported to clients (frames), set through the custom 'mmlt' property.\n"
     "static UInt32                       gDevice_OutputReportedLatency       = 0;\n"
     "#define                             kMM_LatencySelector                 'mmlt'\n"
     "#define                             kMM_MaxReportedLatencySeconds       10\n")

# Has: the custom property and the custom-property list.
start = s.index("static Boolean\tBlackHole_HasDeviceProperty(")
end = s.index("static OSStatus\tBlackHole_IsDevicePropertySettable(", start)
body = s[start:end]
assert body.count(SWITCH) == 1
body = body.replace(SWITCH, SWITCH + "\t\tcase kMM_LatencySelector:\n\t\tcase kAudioObjectPropertyCustomPropertyInfoList:\n\t\t\ttheAnswer = true;\n\t\t\tbreak;\n\n", 1)
s = s[:start] + body + s[end:]

# Settable: only the custom property (the list is read-only).
start = s.index("static OSStatus\tBlackHole_IsDevicePropertySettable(")
end = s.index("static OSStatus\tBlackHole_GetDevicePropertyDataSize(", start)
body = s[start:end]
assert body.count(SWITCH) == 1
body = body.replace(SWITCH, SWITCH + "\t\tcase kMM_LatencySelector:\n\t\t\t*outIsSettable = true;\n\t\t\tbreak;\n\n"
                    "\t\tcase kAudioObjectPropertyCustomPropertyInfoList:\n\t\t\t*outIsSettable = false;\n\t\t\tbreak;\n\n", 1)
s = s[:start] + body + s[end:]

# Data size.
start = s.index("static OSStatus\tBlackHole_GetDevicePropertyDataSize(")
end = s.index("static OSStatus\tBlackHole_GetDevicePropertyData(", start)
body = s[start:end]
assert body.count(SWITCH) == 1
body = body.replace(SWITCH, SWITCH + "\t\tcase kMM_LatencySelector:\n\t\t\t*outDataSize = sizeof(CFPropertyListRef);\n\t\t\tbreak;\n\n"
                    "\t\tcase kAudioObjectPropertyCustomPropertyInfoList:\n\t\t\t*outDataSize = sizeof(AudioServerPlugInCustomPropertyInfo);\n\t\t\tbreak;\n\n", 1)
s = s[:start] + body + s[end:]

# Data.
start = s.index("static OSStatus\tBlackHole_GetDevicePropertyData(")
end = s.index("static OSStatus\tBlackHole_SetDevicePropertyData(", start)
body = s[start:end]
assert body.count(SWITCH) == 1
body = body.replace(SWITCH, SWITCH + """		case kMM_LatencySelector:
			FailWithAction(inDataSize < sizeof(CFPropertyListRef), theAnswer = kAudioHardwareBadPropertySizeError, Done, "BlackHole_GetDevicePropertyData: not enough space for the Magic Mirror latency");
			{
				pthread_mutex_lock(&gPlugIn_StateMutex);
				SInt32 theFrames = (SInt32)gDevice_OutputReportedLatency;
				pthread_mutex_unlock(&gPlugIn_StateMutex);
				*((CFPropertyListRef*)outData) = CFNumberCreate(NULL, kCFNumberSInt32Type, &theFrames);
			}
			*outDataSize = sizeof(CFPropertyListRef);
			break;

		case kAudioObjectPropertyCustomPropertyInfoList:
			FailWithAction(inDataSize < sizeof(AudioServerPlugInCustomPropertyInfo), theAnswer = kAudioHardwareBadPropertySizeError, Done, "BlackHole_GetDevicePropertyData: not enough space for the custom property list");
			((AudioServerPlugInCustomPropertyInfo*)outData)->mSelector = kMM_LatencySelector;
			((AudioServerPlugInCustomPropertyInfo*)outData)->mPropertyDataType = kAudioServerPlugInCustomPropertyDataTypeCFPropertyList;
			((AudioServerPlugInCustomPropertyInfo*)outData)->mQualifierDataType = kAudioServerPlugInCustomPropertyDataTypeNone;
			*outDataSize = sizeof(AudioServerPlugInCustomPropertyInfo);
			break;

""", 1)
old_latency = """			FailWithAction(inDataSize < sizeof(UInt32), theAnswer = kAudioHardwareBadPropertySizeError, Done, "BlackHole_GetDevicePropertyData: not enough space for the return value of kAudioDevicePropertyLatency for the device");
			*((UInt32*)outData) = 0;"""
assert body.count(old_latency) == 1
body = body.replace(old_latency, """			FailWithAction(inDataSize < sizeof(UInt32), theAnswer = kAudioHardwareBadPropertySizeError, Done, "BlackHole_GetDevicePropertyData: not enough space for the return value of kAudioDevicePropertyLatency for the device");
			pthread_mutex_lock(&gPlugIn_StateMutex);
			*((UInt32*)outData) = (inAddress->mScope == kAudioObjectPropertyScopeOutput) ? gDevice_OutputReportedLatency : 0;
			pthread_mutex_unlock(&gPlugIn_StateMutex);""", 1)
s = s[:start] + body + s[end:]

# Set: clamp, store, persist and announce both the custom property and the device latency.
start = s.index("static OSStatus\tBlackHole_SetDevicePropertyData(")
end = s.index("#pragma mark Stream Property Operations", start)
body = s[start:end]
DEFAULT = "\t\tdefault:\n\t\t\ttheAnswer = kAudioHardwareUnknownPropertyError;\n\t\t\tbreak;\n\t};"
assert body.count(DEFAULT) == 1
body = body.replace(DEFAULT, """		case kMM_LatencySelector:
			FailWithAction(inDataSize != sizeof(CFPropertyListRef), theAnswer = kAudioHardwareBadPropertySizeError, Done, "BlackHole_SetDevicePropertyData: wrong size for the Magic Mirror latency");
			{
				CFPropertyListRef theValue = *((const CFPropertyListRef*)inData);
				FailWithAction(theValue == NULL || CFGetTypeID(theValue) != CFNumberGetTypeID(), theAnswer = kAudioHardwareIllegalOperationError, Done, "BlackHole_SetDevicePropertyData: the Magic Mirror latency must be a number of frames");
				SInt32 theFrames = 0;
				CFNumberGetValue((CFNumberRef)theValue, kCFNumberSInt32Type, &theFrames);
				pthread_mutex_lock(&gPlugIn_StateMutex);
				UInt32 theMax = (UInt32)(gDevice_SampleRate * kMM_MaxReportedLatencySeconds);
				UInt32 theNew = theFrames < 0 ? 0 : ((UInt32)theFrames > theMax ? theMax : (UInt32)theFrames);
				Boolean theChanged = theNew != gDevice_OutputReportedLatency;
				gDevice_OutputReportedLatency = theNew;
				pthread_mutex_unlock(&gPlugIn_StateMutex);
				if(theChanged)
				{
					*outNumberPropertiesChanged = 2;
					outChangedAddresses[0].mSelector = kMM_LatencySelector;
					outChangedAddresses[0].mScope = kAudioObjectPropertyScopeGlobal;
					outChangedAddresses[0].mElement = kAudioObjectPropertyElementMain;
					outChangedAddresses[1].mSelector = kAudioDevicePropertyLatency;
					outChangedAddresses[1].mScope = kAudioObjectPropertyScopeOutput;
					outChangedAddresses[1].mElement = kAudioObjectPropertyElementMain;
					SInt32 theStoredFrames = (SInt32)theNew;
					CFNumberRef theStored = CFNumberCreate(NULL, kCFNumberSInt32Type, &theStoredFrames);
					if(theStored != NULL) { gPlugIn_Host->WriteToStorage(gPlugIn_Host, CFSTR("output reported latency"), theStored); CFRelease(theStored); }
				}
			}
			break;

""" + DEFAULT, 1)
s = s[:start] + body + s[end:]

# Restore the persisted value when the plug-in initializes.
anchor = "\t//	initialize the box name from the settings"
assert s.count(anchor) == 1
s = s.replace(anchor, """	//	Magic Mirror: restore the reported output latency.
	gPlugIn_Host->CopyFromStorage(gPlugIn_Host, CFSTR("output reported latency"), &theSettingsData);
	if(theSettingsData != NULL)
	{
		if(CFGetTypeID(theSettingsData) == CFNumberGetTypeID())
		{
			SInt32 theValue = 0;
			CFNumberGetValue((CFNumberRef)theSettingsData, kCFNumberSInt32Type, &theValue);
			gDevice_OutputReportedLatency = theValue > 0 ? (UInt32)theValue : 0;
		}
		CFRelease(theSettingsData);
		theSettingsData = NULL;
	}

""" + anchor, 1)

open(path, "w").write(s)
print("patched")
