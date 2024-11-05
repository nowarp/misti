 contract C {
     owner: Address;
     init() { self.owner = sender(); }

     receive("test") {
         // Bad
         let code1: Int = 128;
         nativeThrowUnless(code1, sender() == self.owner);

         // Bad
         let code2: Int = 256;
         code2 -= 10;
         nativeThrowUnless(code2, sender() == self.owner);

         // OK: No false positive
         let code3: Int = 257;
         nativeThrowUnless(code3, sender() == self.owner);
     }
 }
