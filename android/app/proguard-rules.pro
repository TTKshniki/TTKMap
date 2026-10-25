# Keep Kotlinx Serialization generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class ru.ttk.map.**$$serializer { *; }
-keepclassmembers class ru.ttk.map.** {
    *** Companion;
}
-keepclasseswithmembers class ru.ttk.map.** {
    kotlinx.serialization.KSerializer serializer(...);
}
