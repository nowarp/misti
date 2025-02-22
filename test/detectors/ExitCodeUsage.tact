import "@stdlib/ownable";

 contract C with Ownable {
     owner: Address;
     init() { self.owner = sender(); }

     fun testDivByZero(unknown: Int) {
         // OK: No exception
         let a: Int = 128;
         let b: Int = a / unknown;
         nativeThrowUnless(b, sender() == self.owner);
     }

     receive("test") {
         // Bad
         nativeThrowUnless(128, sender() == self.owner);

         // Bad
         nativeThrowUnless(255, sender() == self.owner);

         // Bad
         let code1: Int = 128;
         nativeThrowUnless(code1, sender() == self.owner);

         // Bad
         let code2: Int = 256;
         code2 = code2 - 10;
         nativeThrowUnless(code2, sender() == self.owner);

         // OK: No false positive
         let code3: Int = 257;
         nativeThrowUnless(code3, sender() == self.owner);
     }
 }
